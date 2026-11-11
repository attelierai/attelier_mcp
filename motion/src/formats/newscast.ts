// Format "newscast": a daily cable-news bulletin from clips of presenters that
// already speak their lines (e.g. H3 image-to-video). Title sequence with the
// news theme → each segment with its own sound, either full frame or split like
// a news channel: the presenter in a box on the left and the story's material
// (a PR, a chart, figures, a post, a podcast, an image or a clip) on the right,
// with a headline band carrying the desk tab, LIVE, the show logo and clock,
// and a ticker; graphic wipes between segments → closing card with its sting.
// The clips' audio is never moved or cut: each plays from fromSeconds for
// exactly its length.

/** One piece of material shown beside the presenter. `illustrative` marks values
 * that were simulated rather than taken from a source; the panel says so on screen. */
export type NewscastPanel = { illustrative?: boolean } & (
  | { kind: "pr"; repo: string; number: number; title: string; author?: string; state?: "merged" | "open" | "closed"; additions?: number; deletions?: number; files?: number; note?: string }
  | { kind: "chart"; label: string; series: number[]; value?: string; note?: string }
  | { kind: "stats"; title?: string; items: { value: string; label: string }[] }
  | { kind: "post"; author: string; handle: string; text: string; likes?: number; reposts?: number; time?: string }
  | { kind: "podcast"; show: string; episode: string; quote: string; minute?: string }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "quote"; text: string; source: string }
  | { kind: "image"; src: string; caption?: string }
  | { kind: "video"; src: string; caption?: string; fromSeconds?: number }
);

export type NewscastSegment = {
  video: string;
  /** Source second to start from (default 0). */
  fromSeconds?: number;
  /** On-screen seconds; defaults to the clip's remaining length. */
  seconds?: number;
  /** full: the presenter fills the frame; split: presenter box left, material right. */
  layout?: "full" | "split";
  /** Desk tab over the headline band (TECH, MARKETS); defaults to TOP STORIES. */
  desk?: string;
  /** Presenter's name under the headline. */
  presenter?: string;
  /** The headline in the band. */
  title?: string;
  /** Material on the right for split segments, shown in turn across the segment. */
  material?: NewscastPanel[];
};

export type NewscastSpec = {
  fps?: 30 | 60;
  /** Show identity: the name's last word is boxed in the brand colour; time/zone start the on-air clock. */
  show: { name: string; date: string; time?: string; zone?: string };
  segments: NewscastSegment[];
  /** Headlines scrolling in the ticker. */
  ticker?: string[];
  /** Title sequence seconds (default 5.5, the length of the bundled theme). */
  intro?: { seconds?: number; overline?: string };
  /** Closing card with the news sting (default 3.5 s). */
  outro?: { seconds?: number; line?: string };
};

export const newscastTimeline = (spec: NewscastSpec, clipSeconds?: number[]) => {
  const intro = spec.intro?.seconds ?? 5.5;
  let at = intro;
  const segments = spec.segments.map((s, i) => {
    const seconds = s.seconds ?? Math.max(0.5, (clipSeconds?.[i] ?? 7) - (s.fromSeconds ?? 0));
    const seg = { ...s, start: at, seconds, end: at + seconds };
    at += seconds;
    return seg;
  });
  const outro = at;
  return { intro, segments, outro, end: outro + (spec.outro?.seconds ?? 3.5) };
};

export const newscastDurationSeconds = (spec: NewscastSpec) => newscastTimeline(spec).end;

const PANEL_FIELDS: Record<NewscastPanel["kind"], string[]> = {
  pr: ["repo", "number", "title"], chart: ["label", "series"], stats: ["items"], post: ["author", "handle", "text"],
  podcast: ["show", "episode", "quote"], list: ["title", "items"], quote: ["text", "source"], image: ["src"], video: ["src"],
};

export const validateNewscast = (spec: NewscastSpec, clipSeconds?: number[]): string[] => {
  const errors: string[] = [];
  if (!spec.show?.name?.trim()) errors.push("show.name is required.");
  if (!spec.segments.length || spec.segments.length > 12) errors.push("segments: 1–12 clips.");
  spec.segments.forEach((s, i) => {
    const from = s.fromSeconds ?? 0;
    const have = clipSeconds?.[i];
    if (s.seconds === undefined && clipSeconds === undefined) errors.push(`segments[${i}].seconds is required when clips cannot be probed.`);
    if (have !== undefined && from + (s.seconds ?? have - from) > have + 0.05) errors.push(`segments[${i}]: ${have.toFixed(2)} s clip is shorter than fromSeconds + seconds.`);
    if (s.title && s.title.length > 70) errors.push(`segments[${i}].title: keep it under 70 characters (${s.title.length}).`);
    if (s.layout === "split" && !s.material?.length) errors.push(`segments[${i}]: layout split needs material (1–4 panels).`);
    if ((s.material?.length ?? 0) > 4) errors.push(`segments[${i}].material: at most 4 panels.`);
    (s.material ?? []).forEach((p, j) => {
      const fields = PANEL_FIELDS[p?.kind as NewscastPanel["kind"]];
      if (!fields) return errors.push(`segments[${i}].material[${j}].kind must be one of ${Object.keys(PANEL_FIELDS).join(", ")}.`);
      const missing = fields.filter((f) => (p as Record<string, unknown>)[f] === undefined || (p as Record<string, unknown>)[f] === "");
      if (missing.length) errors.push(`segments[${i}].material[${j}] (${p.kind}) needs ${missing.join(", ")}.`);
      if (p.kind === "chart" && (!Array.isArray(p.series) || p.series.length < 2 || p.series.some((n) => !Number.isFinite(n)))) errors.push(`segments[${i}].material[${j}].series: at least 2 numbers.`);
      if ((p.kind === "stats" || p.kind === "list") && (!Array.isArray(p.items) || !p.items.length || p.items.length > 4)) errors.push(`segments[${i}].material[${j}].items: 1–4 entries.`);
    });
  });
  return errors;
};

/** Local media referenced by panels (images and clips), for staging. */
export const newscastPanelMedia = (spec: NewscastSpec) =>
  spec.segments.flatMap((s) => (s.material ?? []).flatMap((p) => (p.kind === "image" || p.kind === "video" ? [{ kind: p.kind, path: p.src }] : [])));

export const NEWSCAST_EXAMPLE: NewscastSpec = {
  show: { name: "BITTENSOR NEWS", date: "SEPTEMBER 24, 2026" },
  segments: [
    { video: "/abs/path/intro.mp4", presenter: "LUCÍA FERRER", title: "Tonight: a Subtensor merge and a subnet rally" },
    { video: "/abs/path/tech.mp4", layout: "split", desk: "TECH", presenter: "MARCO IBÁÑEZ", title: "Subtensor merges PR #3196", material: [
      { kind: "pr", repo: "opentensor/subtensor", number: 3196, title: "Add swap_basket_many extrinsic", author: "UnArbosFive", state: "merged", additions: 412, deletions: 38, files: 9, illustrative: true },
      { kind: "list", title: "What changes", items: ["Swap into several subnets in one call", "Not live on chain yet"] },
    ] },
  ],
  ticker: ["PR #3196 MERGED", "SN112 UP 171% THIS WEEK"],
};
