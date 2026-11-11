// Format "making-of": how a video was made. The finished video as hook → a real
// screen recording of the whole process (generation, the agent at work, the
// download), sped up per segment with a camera that follows the action, section
// titles and an elapsed clock → optional result card with its numbers → brand
// end card. Driven by voice-over lines, not beats.
export type Credit = { label: string; items: { text: string; logo?: string }[] };

export type MakingOfSegment = {
  /** Source seconds in the screen recording. */
  from: number;
  to: number;
  /** On-screen seconds; speed = (to - from) / seconds. */
  seconds: number;
  /** Source-pixel rect to frame; omit to show the whole screen as a window. */
  focus?: { x: number; y: number; w: number; h: number };
  /** Short label, e.g. "contact_sheet · 4 clips". */
  caption?: string;
  /** Big section title shown over the whole screen as the segment starts, e.g. "Attelier Create". */
  title?: string;
  /** Source second where this segment's elapsed clock reads 0:00; omit to hide the clock. */
  clockZero?: number;
};

export type MakingOfSpec = {
  fps?: 30 | 60;
  /** The finished video: a few seconds open the piece and it plays again at the end. */
  result: { video: string; hookFrom: number; finaleFrom: number };
  /** overline: small line above the title, e.g. "DIRECTOR'S CUT". */
  hook?: { title?: string; overline?: string; seconds?: number };
  /** crossfade: seconds each segment dissolves over the previous one (default 0.35). */
  screen: { video: string; segments: MakingOfSegment[]; crossfade?: number };
  /** Optional closing card: the result with 2–4 facts. */
  finale?: { seconds?: number; stats: string[] };
  /** Voice-over lines placed on the output timeline; seconds is filled in by probing. */
  /** words: optional word timings (seconds from the line's start) shown as captions. */
  voice: { src: string; at: number; seconds?: number; words?: { text: string; start: number; end: number }[] }[];
  music: { src: string; fromSeconds?: number; volume?: number };
  /** cta: the closing line under the logo, e.g. "Now live at [attelier.ai]" ([brackets] in brand colour). */
  endcard?: { tagline?: string[]; credits?: Credit[]; cta?: string; seconds?: number };
  /** Caption style for voice lines with word timings (default subtitle). */
  captions?: "subtitle" | "karaoke";
};

export const makingOfTimeline = (spec: MakingOfSpec) => {
  const hook = spec.hook?.seconds ?? 3.5;
  const screenStart = hook;
  let at = screenStart;
  const segments = spec.screen.segments.map((s) => {
    const seg = { ...s, start: at, speed: (s.to - s.from) / s.seconds };
    at += s.seconds;
    return seg;
  });
  const finale = at;
  const endcard = finale + (spec.finale ? spec.finale.seconds ?? 6 : 0);
  return { hook, screen: screenStart, segments, finale, endcard, end: endcard + (spec.endcard?.seconds ?? 5) };
};

export const makingOfDurationSeconds = (spec: MakingOfSpec) => makingOfTimeline(spec).end;

export const validateMakingOf = (spec: MakingOfSpec, _clipSeconds?: number[], musicSeconds?: number): string[] => {
  const errors: string[] = [];
  if (!spec.screen.segments.length) errors.push("screen.segments: at least one segment.");
  spec.screen.segments.forEach((s, i) => {
    if (!(s.to > s.from)) errors.push(`screen.segments[${i}]: to must be after from.`);
    if (!(s.seconds > 0)) errors.push(`screen.segments[${i}].seconds must be > 0.`);
  });
  const T = makingOfTimeline(spec);
  spec.voice.forEach((v, i) => {
    if (v.at < 0 || v.at + (v.seconds ?? 0) > T.end + 0.05) errors.push(`voice[${i}]: ends after the video (${T.end.toFixed(2)} s).`);
    const next = spec.voice[i + 1];
    if (next && v.seconds !== undefined && v.at + v.seconds > next.at + 0.05) errors.push(`voice[${i}] overlaps voice[${i + 1}]: move voice[${i + 1}].at to ≥ ${(v.at + v.seconds).toFixed(2)}.`);
  });
  if (musicSeconds !== undefined && (spec.music.fromSeconds ?? 0) + T.end > musicSeconds + 0.05) errors.push(`music: ${musicSeconds.toFixed(2)} s is shorter than the ${T.end.toFixed(2)} s video from ${spec.music.fromSeconds ?? 0} s.`);
  return errors;
};

export const MAKING_OF_EXAMPLE: MakingOfSpec = {
  result: { video: "/abs/path/final.mp4", hookFrom: 7.3, finaleFrom: 11 },
  hook: { title: "HOW WE MADE [THIS]" },
  screen: {
    video: "/abs/path/screen-recording.mp4",
    segments: [
      { from: 2, to: 6, seconds: 2.5, title: "Attelier Create" },
      { from: 6, to: 40, seconds: 4, focus: { x: 530, y: 780, w: 1100, h: 300 }, caption: "One prompt, four models" },
      { from: 300, to: 480, seconds: 8, focus: { x: 580, y: 400, w: 1000, h: 560 }, clockZero: 300, caption: "Atte inspects clips and music" },
    ],
  },
  voice: [{ src: "/abs/path/vo1.mp3", at: 0.3 }],
  music: { src: "/abs/path/track.mp3", fromSeconds: 0, volume: 0.3 },
};
