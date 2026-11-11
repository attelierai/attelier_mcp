import type { Project, TimelineElement, Track } from "@attelier/project-schema";

export type LocatedProjectElement = {
  element: TimelineElement;
  track: Track;
};

export const activeProjectSequence = (project: Project) =>
  project.sequences.find((sequence) => sequence.id === project.activeSequenceId);

export const locateProjectElement = (
  project: Project,
  elementId: string,
): LocatedProjectElement | undefined => {
  for (const sequence of project.sequences) {
    for (const track of sequence.tracks) {
      const element = track.elements.find((candidate) => candidate.id === elementId);
      if (element) return { element, track };
    }
  }
  return undefined;
};

export const nextProjectSplitElementId = (project: Project, elementId: string): string => {
  const taken = new Set(
    project.sequences.flatMap((sequence) =>
      sequence.tracks.flatMap((track) => track.elements.map(({ id }) => id)),
    ),
  );
  let index = 1;
  while (taken.has(`${elementId}-split-${index}`)) index += 1;
  return `${elementId}-split-${index}`;
};

/** One provider-neutral tool call as the planner emits it. Declared here so
 * the kit's policy layer stays free of the harness compiler. */
export type AttelierProjectToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * The model-facing view of a project snapshot.
 *
 * Every durable time in a project is an integer tick string at 120,000 ticks
 * per second, which is exactly what a tool input needs and exactly what a
 * language model misreads: "2407680" was being reported to users as fifty
 * seconds for a twenty-second clip. This annotates the snapshot with the same
 * times in seconds *next to* the ticks — never instead of them — so the model
 * can talk in seconds and still pass ticks back into a tool.
 */
export const TICKS_PER_SECOND = 120_000;

const asSeconds = (ticks: unknown): number | undefined => {
  const value = Number(ticks);
  return Number.isFinite(value) ? Number((value / TICKS_PER_SECOND).toFixed(3)) : undefined;
};

const annotateRange = (range: unknown): unknown => {
  if (!range || typeof range !== "object" || Array.isArray(range)) return range;
  const source = range as Record<string, unknown>;
  const startSeconds = asSeconds(source.start);
  const durationSeconds = asSeconds(source.duration);
  return {
    ...source,
    ...(startSeconds === undefined ? {} : { startSeconds }),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(startSeconds !== undefined && durationSeconds !== undefined
      ? { endSeconds: Number((startSeconds + durationSeconds).toFixed(3)) }
      : {}),
  };
};

/** Annotate one already-serialized project snapshot with human-readable
 * seconds. The input is treated as untrusted JSON, not as a typed `Project`,
 * because it comes back from durable storage. */
export const withReadableProjectTimes = (snapshot: unknown): unknown => {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return snapshot;
  const project = snapshot as Record<string, unknown>;
  const assets = Array.isArray(project.assets)
    ? project.assets.map((asset) => {
        if (!asset || typeof asset !== "object" || Array.isArray(asset)) return asset;
        const record = asset as Record<string, unknown>;
        const durationSeconds = record.duration === undefined ? undefined : asSeconds(record.duration);
        return durationSeconds === undefined ? record : { ...record, durationSeconds };
      })
    : project.assets;
  const sequences = Array.isArray(project.sequences)
    ? project.sequences.map((sequence) => {
        if (!sequence || typeof sequence !== "object" || Array.isArray(sequence)) return sequence;
        const record = sequence as Record<string, unknown>;
        const tracks = Array.isArray(record.tracks)
          ? record.tracks.map((track) => {
              if (!track || typeof track !== "object" || Array.isArray(track)) return track;
              const trackRecord = track as Record<string, unknown>;
              const elements = Array.isArray(trackRecord.elements)
                ? trackRecord.elements.map((element) => {
                    if (!element || typeof element !== "object" || Array.isArray(element)) return element;
                    const elementRecord = element as Record<string, unknown>;
                    return {
                      ...elementRecord,
                      ...(elementRecord.timelineRange === undefined
                        ? {}
                        : { timelineRange: annotateRange(elementRecord.timelineRange) }),
                      ...(elementRecord.sourceRange === undefined
                        ? {}
                        : { sourceRange: annotateRange(elementRecord.sourceRange) }),
                    };
                  })
                : trackRecord.elements;
              return elements === trackRecord.elements ? trackRecord : { ...trackRecord, elements };
            })
          : record.tracks;
        const markers = Array.isArray(record.markers)
          ? record.markers.map((marker) => {
              if (!marker || typeof marker !== "object" || Array.isArray(marker)) return marker;
              const markerRecord = marker as Record<string, unknown>;
              const atSeconds = markerRecord.at === undefined ? undefined : asSeconds(markerRecord.at);
              return atSeconds === undefined ? markerRecord : { ...markerRecord, atSeconds };
            })
          : record.markers;
        return { ...record, tracks, ...(record.markers === undefined ? {} : { markers }) };
      })
    : project.sequences;
  return {
    ...project,
    ...(project.assets === undefined ? {} : { assets }),
    ...(project.sequences === undefined ? {} : { sequences }),
    timeUnits: `Every *Ticks-valued field stays the durable integer tick string at ${TICKS_PER_SECOND} ticks per second and is what tool inputs expect; the *Seconds fields beside it are the same instant in seconds and are what you should quote to a person.`,
  };
};
