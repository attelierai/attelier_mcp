import {
  secondsToTicks,
  ticksToSeconds,
  type Project,
  type ProjectOperation,
  type TimelineElement,
  type TransitionKind,
} from "@attelier/project-schema";
import { activeProjectSequence } from "@atte/kit/project-tool-utils";

export class TransitionPlanError extends Error {}

export type TransitionPair = {
  outgoing: TimelineElement;
  incoming: TimelineElement;
  trackId: string;
};

const isVisual = (element: TimelineElement): boolean =>
  element.kind === "video" || element.kind === "image";

const sortedElements = (elements: TimelineElement[]): TimelineElement[] =>
  [...elements].sort((left, right) =>
    Number(left.timelineRange.start) - Number(right.timelineRange.start) ||
    left.id.localeCompare(right.id));

/** Resolve two adjacent visual clips. `incomingId` may be omitted for agent/UI convenience. */
export const resolveTransitionPair = (
  project: Project,
  outgoingId: string,
  incomingId?: string,
): TransitionPair => {
  const sequence = activeProjectSequence(project);
  if (!sequence) throw new TransitionPlanError("The project has no active sequence.");
  for (const track of sequence.tracks) {
    const ordered = sortedElements(track.elements);
    const outgoingIndex = ordered.findIndex((element) => element.id === outgoingId);
    if (outgoingIndex < 0) continue;
    const outgoing = ordered[outgoingIndex]!;
    const incoming = incomingId
      ? ordered.find((element) => element.id === incomingId)
      : ordered.slice(outgoingIndex + 1).find(isVisual);
    if (!incoming || !isVisual(outgoing) || !isVisual(incoming)) {
      throw new TransitionPlanError("A transition needs two visual clips on the same track.");
    }
    const incomingIndex = ordered.findIndex((element) => element.id === incoming.id);
    if (incomingIndex !== outgoingIndex + 1) {
      throw new TransitionPlanError("Transitions can only join adjacent clips on one track.");
    }
    return { outgoing, incoming, trackId: track.id };
  }
  throw new TransitionPlanError(`Clip ${outgoingId} was not found on the active sequence.`);
};

/**
 * Compile an authored transition into one reversible canonical operation.
 * Transitions create the required overlap and ripple all later elements on
 * that track. Dip transitions fade each edge against their explicit black or
 * white plate within that authored overlap.
 */
export const buildTransitionOperations = (
  project: Project,
  outgoingId: string,
  incomingId: string | undefined,
  kind: TransitionKind,
  requestedDurationSeconds = 0.5,
): ProjectOperation[] => {
  const sequence = activeProjectSequence(project);
  if (!sequence) throw new TransitionPlanError("The project has no active sequence.");
  const pair = resolveTransitionPair(project, outgoingId, incomingId);
  const track = sequence.tracks.find((candidate) => candidate.id === pair.trackId);
  if (!track) throw new TransitionPlanError("The transition track no longer exists.");
  if (track.locked) throw new TransitionPlanError(`Track “${track.name}” is locked.`);

  const outgoingDuration = ticksToSeconds(pair.outgoing.timelineRange.duration);
  const incomingDuration = ticksToSeconds(pair.incoming.timelineRange.duration);
  const maximum = Math.min(2, outgoingDuration / 2, incomingDuration / 2);
  const duration = Math.min(maximum, Math.max(0.1, requestedDurationSeconds));
  if (!Number.isFinite(duration) || maximum < 0.1) {
    throw new TransitionPlanError("Both clips must be at least 0.2 seconds long.");
  }

  const outgoingEnd =
    ticksToSeconds(pair.outgoing.timelineRange.start) + outgoingDuration;
  const incomingStart = ticksToSeconds(pair.incoming.timelineRange.start);
  const desiredIncomingStart = outgoingEnd - duration;
  const rippleDelta = desiredIncomingStart - incomingStart;
  const previousRipple = Number(pair.incoming.properties["transition.in.rippleDeltaSeconds"] ?? 0);
  const ordered = sortedElements(track.elements).map((element) => structuredClone(element));
  const incomingIndex = ordered.findIndex((element) => element.id === pair.incoming.id);
  if (incomingIndex < 0) throw new TransitionPlanError("The incoming clip no longer exists.");

  for (let index = incomingIndex; index < ordered.length; index += 1) {
    const element = ordered[index]!;
    const nextStart = ticksToSeconds(element.timelineRange.start) + rippleDelta;
    if (nextStart < 0) throw new TransitionPlanError("The transition would move media before zero.");
    element.timelineRange.start = secondsToTicks(nextStart);
  }

  const outgoing = ordered.find((element) => element.id === pair.outgoing.id)!;
  const incoming = ordered.find((element) => element.id === pair.incoming.id)!;
  outgoing.properties["transition.out.type"] = kind;
  outgoing.properties["transition.out.durationSeconds"] = duration;
  outgoing.properties["transition.out.toElementId"] = incoming.id;
  incoming.properties["transition.in.type"] = kind;
  incoming.properties["transition.in.durationSeconds"] = duration;
  incoming.properties["transition.in.fromElementId"] = outgoing.id;
  incoming.properties["transition.in.rippleDeltaSeconds"] = previousRipple + rippleDelta;
  if (kind === "dip-to-black" || kind === "dip-to-white") {
    outgoing.properties["transition.out.overlapSeconds"] = duration;
    incoming.properties["transition.in.overlapSeconds"] = duration;
  }

  return [{ type: "replaceTrackElements", trackId: track.id, elements: ordered }];
};
