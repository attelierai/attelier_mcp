import type { AnimationChannel, MediaTime, Project, ProjectOperation, TimelineElement, Track } from "@attelier/project-schema";

/** Deterministic multicam planning for clips which are already aligned.
 * This deliberately does not claim waveform or timecode synchronization. */
export type MulticamAngle = { id: string; elementId: string };
export type MulticamSwitch = { at: MediaTime; angleId: string };
export type MulticamRequest = {
  groupId: string;
  angles: MulticamAngle[];
  switches: MulticamSwitch[];
  audioAngleId: string;
};
export type MulticamPlan = {
  sequenceId: string;
  groupId: string;
  start: MediaTime;
  duration: MediaTime;
  switches: MulticamSwitch[];
  audioAngleId: string;
  programVideoTrackId: string;
  programAudioTrackId: string;
  operations: ProjectOperation[];
};

export class MulticamError extends Error {}

const ticks = (value: MediaTime, label: string): number => {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) throw new MulticamError(`${label} must be an exact non-negative media time.`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new MulticamError(`${label} exceeds safe media-time precision.`);
  return result;
};

const mediaTime = (value: number): MediaTime => String(value) as MediaTime;

const segmentChannels = (channels: readonly AnimationChannel[], offset: number, duration: number): AnimationChannel[] =>
  channels.flatMap((channel) => {
    const keyframes = channel.keyframes
      .filter(({ at }) => {
        const value = ticks(at, `${channel.path} keyframe`);
        return value >= offset && value <= offset + duration;
      })
      .map((keyframe) => ({ ...keyframe, at: mediaTime(ticks(keyframe.at, `${channel.path} keyframe`) - offset) }));
    return keyframes.length > 0 ? [{ ...channel, keyframes }] : [];
  });

/** Validate and compile a real program cut from pre-aligned angles. The source
 * elements remain in the revision as hidden/muted references, while an output
 * video track carries contiguous selected segments and one audio track carries
 * the explicitly selected angle. No media is generated, copied or synchronized. */
export const compileMulticamSwitchPlan = (project: Project, request: MulticamRequest): MulticamPlan => {
  const sequence = project.sequences.find(({ id }) => id === project.activeSequenceId);
  if (!sequence) throw new MulticamError(`Active sequence ${project.activeSequenceId} is missing.`);
  if (!request.groupId.trim()) throw new MulticamError("groupId is required.");
  if (!Array.isArray(request.angles) || request.angles.length < 2) throw new MulticamError("Multicam requires at least two pre-aligned video angles.");
  if (new Set(request.angles.map(({ id }) => id)).size !== request.angles.length) throw new MulticamError("Multicam angle IDs must be unique.");
  const byId = new Map(sequence.tracks.flatMap((track) => track.elements.map((element) => [element.id, { element, track }] as const)));
  const angleElements = request.angles.map((angle) => {
    if (!angle.id.trim() || !angle.elementId.trim()) throw new MulticamError("Multicam angle and element IDs are required.");
    const located = byId.get(angle.elementId);
    const element = located?.element;
    if (!located || !element || element.kind !== "video" || !element.assetId) throw new MulticamError(`Angle ${angle.id} must reference an existing video element in the active sequence.`);
    if (located.track.locked) throw new MulticamError(`Angle ${angle.id} is on locked track ${located.track.id}.`);
    const asset = project.assets.find(({ id }) => id === element.assetId);
    if (!asset || asset.mediaType !== "video") throw new MulticamError(`Angle ${angle.id} must reference a video asset.`);
    const playbackRate = element.properties["playback.rate"];
    if (
      (playbackRate !== undefined &&
        (typeof playbackRate !== "number" || !Number.isFinite(playbackRate) || Math.abs(playbackRate - 1) > 1e-9)) ||
      element.properties["playback.reverse"] === true ||
      element.properties["playback.freeze"] === true
    ) {
      throw new MulticamError(`Angle ${angle.id} must use normal forward playback before creating a multicam cut.`);
    }
    return { angle, element, track: located.track, asset };
  });
  if (new Set(request.angles.map(({ elementId }) => elementId)).size !== request.angles.length) throw new MulticamError("Multicam angles must reference distinct elements.");
  const start = ticks(angleElements[0]!.element.timelineRange.start, "angle timeline start");
  const duration = ticks(angleElements[0]!.element.timelineRange.duration, "angle duration");
  if (duration <= 0) throw new MulticamError("Multicam angle duration must be positive.");
  for (const { angle, element } of angleElements) {
    if (ticks(element.timelineRange.start, `${angle.id} timeline start`) !== start || ticks(element.timelineRange.duration, `${angle.id} duration`) !== duration) {
      throw new MulticamError("All multicam angles must share one contiguous pre-aligned range.");
    }
  }
  const angleIds = new Set(request.angles.map(({ id }) => id));
  if (!angleIds.has(request.audioAngleId)) throw new MulticamError("audioAngleId must reference one of the declared angles.");
  if (!Array.isArray(request.switches) || request.switches.length === 0) throw new MulticamError("At least one switch at the aligned range start is required.");
  const switches = request.switches.map((item, index) => {
    const at = ticks(item.at, `switch ${index + 1} time`);
    if (!angleIds.has(item.angleId)) throw new MulticamError(`Switch ${index + 1} references an unknown angle.`);
    if (at < start || at >= start + duration) throw new MulticamError(`Switch ${index + 1} is outside the aligned range.`);
    return { at: item.at, angleId: item.angleId, numericAt: at };
  });
  if (switches[0]!.numericAt !== start) throw new MulticamError("Switches must begin at the aligned range start; gaps are not allowed.");
  for (let index = 1; index < switches.length; index += 1) if (switches[index]!.numericAt <= switches[index - 1]!.numericAt) throw new MulticamError("Multicam switches must be strictly increasing.");
  for (let index = 1; index < switches.length; index += 1) if (switches[index]!.angleId === switches[index - 1]!.angleId) throw new MulticamError("Adjacent multicam switches must select different angles.");
  const normalized = switches.map(({ at, angleId }) => ({ at, angleId }));
  const programVideoTrackId = `${request.groupId}:program-video`;
  const programAudioTrackId = `${request.groupId}:program-audio`;
  const existingIds = new Set(sequence.tracks.flatMap((track) => [track.id, ...track.elements.map(({ id }) => id)]));
  if (existingIds.has(programVideoTrackId) || existingIds.has(programAudioTrackId)) {
    throw new MulticamError(`Multicam group ${request.groupId} already has a program track.`);
  }
  const byAngleId = new Map(angleElements.map((located) => [located.angle.id, located]));
  const metadata = {
    "multicam.groupId": request.groupId,
    "multicam.audioAngleId": request.audioAngleId,
    "multicam.preAligned": true,
    "multicam.switches": normalized,
  };
  const sourceOperations = angleElements.map(({ angle, element }): ProjectOperation => ({
    type: "replaceElement",
    elementId: element.id,
    element: {
      ...element,
      properties: {
        ...element.properties,
        ...metadata,
        "multicam.angleId": angle.id,
        "multicam.source": true,
        "transform.opacity": 0,
        "audio.muted": true,
      },
      keyframes: element.keyframes.filter(({ path }) => path !== "transform.opacity"),
    },
  }));
  const programElements = switches.map((item, index): TimelineElement => {
    const selected = byAngleId.get(item.angleId)!;
    const segmentStart = item.numericAt;
    const segmentEnd = switches[index + 1]?.numericAt ?? start + duration;
    const segmentDuration = segmentEnd - segmentStart;
    const offset = segmentStart - start;
    const sourceStart = selected.element.sourceRange
      ? ticks(selected.element.sourceRange.start, `${item.angleId} source start`) + offset
      : offset;
    const id = `${request.groupId}:program:${index + 1}`;
    if (existingIds.has(id)) throw new MulticamError(`Generated multicam element ID ${id} already exists.`);
    existingIds.add(id);
    return {
      ...selected.element,
      id,
      name: `${selected.element.name} — ${item.angleId}`,
      timelineRange: { start: mediaTime(segmentStart), duration: mediaTime(segmentDuration) },
      sourceRange: { start: mediaTime(sourceStart), duration: mediaTime(segmentDuration) },
      properties: {
        ...selected.element.properties,
        ...metadata,
        "multicam.angleId": item.angleId,
        "multicam.program": true,
        "audio.muted": true,
      },
      keyframes: segmentChannels(selected.element.keyframes, offset, segmentDuration),
    };
  });
  const maxTrackOrder = Math.max(0, ...sequence.tracks.map(({ order }) => order));
  const videoTrack: Track = {
    id: programVideoTrackId,
    name: `Multicam ${request.groupId} — Program`,
    kind: "video",
    order: maxTrackOrder + 1,
    locked: false,
    muted: false,
    hidden: false,
    elements: programElements,
  };
  const audioSource = byAngleId.get(request.audioAngleId)!;
  if (!Number.isSafeInteger(audioSource.asset.channels) || (audioSource.asset.channels ?? 0) < 1) {
    throw new MulticamError(`Audio angle ${request.audioAngleId} has no measured audio stream.`);
  }
  const audioElement: TimelineElement = {
    id: `${request.groupId}:program:audio`,
    name: `${audioSource.element.name} — program audio`,
    kind: "audio",
    assetId: audioSource.element.assetId!,
    timelineRange: { start: mediaTime(start), duration: mediaTime(duration) },
    sourceRange: audioSource.element.sourceRange
      ? { ...audioSource.element.sourceRange }
      : { start: mediaTime(0), duration: mediaTime(duration) },
    properties: {
      ...audioSource.element.properties,
      ...metadata,
      "multicam.angleId": request.audioAngleId,
      "multicam.programAudio": true,
      "audio.muted": false,
    },
    keyframes: audioSource.element.keyframes.filter(({ path }) => path.startsWith("audio.")),
  };
  const audioTrack: Track = {
    id: programAudioTrackId,
    name: `Multicam ${request.groupId} — Audio`,
    kind: "audio",
    order: maxTrackOrder + 2,
    locked: false,
    muted: false,
    hidden: false,
    elements: [audioElement],
  };
  const operations: ProjectOperation[] = [
    ...sourceOperations,
    { type: "addTrack", sequenceId: sequence.id, track: videoTrack },
    { type: "addTrack", sequenceId: sequence.id, track: audioTrack },
  ];
  return {
    sequenceId: sequence.id,
    groupId: request.groupId,
    start: angleElements[0]!.element.timelineRange.start,
    duration: angleElements[0]!.element.timelineRange.duration,
    switches: normalized,
    audioAngleId: request.audioAngleId,
    programVideoTrackId,
    programAudioTrackId,
    operations,
  };
};
