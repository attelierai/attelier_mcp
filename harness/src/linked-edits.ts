import type {
  LinkGroup,
  MediaTime,
  ProjectOperation,
  Sequence,
  TimeRange,
  TimelineElement,
} from "@attelier/project-schema";

export class LinkedEditPlanError extends Error {}

type LocatedMember = {
  element: TimelineElement;
  trackLocked: boolean;
};

export type LinkedTrimRequest = {
  timelineRange: TimeRange;
  sourceRange?: TimeRange;
};

const toTicks = (value: MediaTime, label: string): bigint => {
  try {
    return BigInt(value);
  } catch {
    throw new LinkedEditPlanError(`${label} must be an integer media time.`);
  }
};

const toMediaTime = (value: bigint): MediaTime => String(value) as MediaTime;

const assertRange = (range: TimeRange, label: string): void => {
  const start = toTicks(range.start, `${label} start`);
  const duration = toTicks(range.duration, `${label} duration`);
  if (start < 0n || duration <= 0n) {
    throw new LinkedEditPlanError(
      `${label} must have a non-negative start and positive duration.`,
    );
  }
};

const rangesEqual = (left: TimeRange, right: TimeRange): boolean =>
  left.start === right.start && left.duration === right.duration;

const copyGroup = (group: LinkGroup): LinkGroup => ({
  id: group.id,
  elementIds: [...group.elementIds],
});

/** Return the one link group containing an element and fail closed on ambiguity. */
export const findLinkGroupForElement = (
  sequence: Sequence,
  elementId: string,
): LinkGroup | undefined => {
  const matches = (sequence.linkGroups ?? []).filter((group) =>
    group.elementIds.includes(elementId),
  );
  if (matches.length > 1) {
    throw new LinkedEditPlanError(
      `Element “${elementId}” belongs to multiple link groups.`,
    );
  }
  return matches[0] ? copyGroup(matches[0]) : undefined;
};

const locateLinkedMembers = (
  sequence: Sequence,
  elementId: string,
): { group: LinkGroup; members: LocatedMember[] } => {
  const group = findLinkGroupForElement(sequence, elementId);
  if (!group) throw new LinkedEditPlanError(`Element “${elementId}” is not linked.`);
  if (!group.id.trim() || group.elementIds.length < 2) {
    throw new LinkedEditPlanError(`Link group “${group.id}” is invalid.`);
  }

  const memberIds = new Set<string>();
  for (const memberId of group.elementIds) {
    if (!memberId.trim() || memberIds.has(memberId)) {
      throw new LinkedEditPlanError(`Link group “${group.id}” has ambiguous members.`);
    }
    memberIds.add(memberId);
  }

  for (const memberId of memberIds) {
    if (
      (sequence.linkGroups ?? []).some(
        (candidate) =>
          candidate.id !== group.id && candidate.elementIds.includes(memberId),
      )
    ) {
      throw new LinkedEditPlanError(
        `Link group “${group.id}” overlaps another link group.`,
      );
    }
  }

  const members = group.elementIds.map((memberId) => {
    const locations = sequence.tracks.flatMap((track) =>
      track.elements
        .filter((element) => element.id === memberId)
        .map((element) => ({ element, trackLocked: track.locked })),
    );
    if (locations.length !== 1) {
      throw new LinkedEditPlanError(
        `Linked member “${memberId}” is missing or ambiguous.`,
      );
    }
    const location = locations[0];
    if (!location) {
      throw new LinkedEditPlanError(
        `Linked member “${memberId}” is missing or ambiguous.`,
      );
    }
    if (location.trackLocked) {
      throw new LinkedEditPlanError(
        `Linked member “${memberId}” is on a locked track.`,
      );
    }
    return location;
  });

  return { group, members };
};

const unlink = (sequence: Sequence, group: LinkGroup): ProjectOperation => ({
  type: "deleteLinkGroup",
  sequenceId: sequence.id,
  linkGroupId: group.id,
});

const relink = (sequence: Sequence, group: LinkGroup): ProjectOperation => ({
  type: "addLinkGroup",
  sequenceId: sequence.id,
  linkGroup: copyGroup(group),
});

/** Apply the selected member's timeline delta to every member. */
export const planLinkedMove = (
  sequence: Sequence,
  elementId: string,
  start: MediaTime,
): ProjectOperation[] => {
  const { group, members } = locateLinkedMembers(sequence, elementId);
  const selected = members.find(({ element }) => element.id === elementId)?.element;
  if (!selected) {
    throw new LinkedEditPlanError(`Linked member “${elementId}” is missing.`);
  }
  const requestedStart = toTicks(start, "Move start");
  if (requestedStart < 0n) {
    throw new LinkedEditPlanError("Move start must be non-negative.");
  }
  const delta =
    requestedStart - toTicks(selected.timelineRange.start, "Current timeline start");
  const moves = members.map(({ element }): ProjectOperation => {
    const nextStart =
      toTicks(element.timelineRange.start, `Timeline start for “${element.id}”`) + delta;
    if (nextStart < 0n) {
      throw new LinkedEditPlanError(
        `Moving “${elementId}” would move “${element.id}” before the timeline start.`,
      );
    }
    return {
      type: "moveElement",
      elementId: element.id,
      start: toMediaTime(nextStart),
    };
  });
  return [unlink(sequence, group), ...moves, relink(sequence, group)];
};

/** Preserve sync and apply the selected source deltas to each member's own source window. */
export const planLinkedTrim = (
  sequence: Sequence,
  elementId: string,
  request: LinkedTrimRequest,
): ProjectOperation[] => {
  const { group, members } = locateLinkedMembers(sequence, elementId);
  const selected = members.find(({ element }) => element.id === elementId)?.element;
  if (!selected) {
    throw new LinkedEditPlanError(`Linked member “${elementId}” is missing.`);
  }
  assertRange(request.timelineRange, "Trim timeline range");
  assertRange(selected.timelineRange, `Timeline range for “${elementId}”`);
  if (!members.every(({ element }) => rangesEqual(element.timelineRange, selected.timelineRange))) {
    throw new LinkedEditPlanError(
      "Linked trim requires every member to share the same timeline range.",
    );
  }

  let sourceStartDelta: bigint | undefined;
  let sourceDurationDelta: bigint | undefined;
  if (request.sourceRange) {
    assertRange(request.sourceRange, "Trim source range");
    if (!selected.sourceRange || members.some(({ element }) => !element.sourceRange)) {
      throw new LinkedEditPlanError(
        "Linked trim requires source ranges for every member.",
      );
    }
    sourceStartDelta =
      toTicks(request.sourceRange.start, "Trim source start") -
      toTicks(selected.sourceRange.start, `Source start for “${elementId}”`);
    sourceDurationDelta =
      toTicks(request.sourceRange.duration, "Trim source duration") -
      toTicks(selected.sourceRange.duration, `Source duration for “${elementId}”`);
  } else if (selected.sourceRange || members.some(({ element }) => element.sourceRange)) {
    throw new LinkedEditPlanError(
      "Linked trim must retain source ranges for every member.",
    );
  }

  const trims = members.map(({ element }): ProjectOperation => {
    let sourceRange: TimeRange | undefined;
    if (sourceStartDelta !== undefined && sourceDurationDelta !== undefined) {
      const current = element.sourceRange;
      if (!current) {
        throw new LinkedEditPlanError(
          `Linked member “${element.id}” has no source range.`,
        );
      }
      sourceRange = {
        start: toMediaTime(
          toTicks(current.start, `Source start for “${element.id}”`) + sourceStartDelta,
        ),
        duration: toMediaTime(
          toTicks(current.duration, `Source duration for “${element.id}”`) +
            sourceDurationDelta,
        ),
      };
      assertRange(sourceRange, `Source range for “${element.id}”`);
    }
    return {
      type: "trimElement",
      elementId: element.id,
      timelineRange: { ...request.timelineRange },
      ...(sourceRange ? { sourceRange } : {}),
    };
  });
  return [unlink(sequence, group), ...trims, relink(sequence, group)];
};

/** Delete the group metadata before deleting every linked member. */
export const planLinkedDelete = (
  sequence: Sequence,
  elementId: string,
): ProjectOperation[] => {
  const { group, members } = locateLinkedMembers(sequence, elementId);
  return [
    unlink(sequence, group),
    ...members.map(({ element }): ProjectOperation => ({
      type: "deleteElement",
      elementId: element.id,
    })),
  ];
};
