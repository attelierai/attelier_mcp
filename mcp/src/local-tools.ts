// Tools that run where the agent runs (a laptop or a remote session sandbox):
// motion formats, rendering and media/music analysis from @attelier/motion.
// They need no API call, so they work before a project exists.
import { readFileSync } from "node:fs";
import { hostRoot, isInside } from "./roots.ts";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type LocalToolResult = { content: ToolContent[]; structuredContent?: unknown; isError?: boolean };

/** The signed-in Attelier API, for local tools that read or keep the person's data. */
export type LocalApi = {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body: unknown) => Promise<unknown>;
  delete: (path: string) => Promise<unknown>;
};

type LocalTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Record<string, unknown>, api?: LocalApi) => Promise<LocalToolResult>;
};

const motion = () => import("@attelier/motion");
// MCP structuredContent must be an object; lists travel as { items }.
/** An agent may name an output .jpg or .webp; the declared type must match the bytes or the model API rejects the image. */
const imageType = (file: string) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" } as Record<string, string>)[path.extname(file).toLowerCase()] ?? "image/png";

const json = (value: unknown, images: string[] = []): LocalToolResult => ({
  structuredContent: value !== null && typeof value === "object" && !Array.isArray(value) ? value : { items: value },
  content: [
    { type: "text", text: JSON.stringify(value, null, 1) },
    ...images.map((file) => ({ type: "image" as const, data: readFileSync(file).toString("base64"), mimeType: imageType(file) })),
  ],
});
const ROOT = hostRoot();
/** Resolve a path an agent passed; under a host root it must stay inside it (reads may also use the sound effects). */
const confined = (value: string, access: "read" | "write" = "read") => {
  const file = path.resolve(ROOT ?? "", value);
  if (ROOT && !isInside(file, access === "read" ? [ROOT, sfxDir()] : [ROOT])) throw new Error(`${value} is outside the working folder ${ROOT}.`);
  return file;
};
const str = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return confined(value);
};
const num = (input: Record<string, unknown>, key: string) => (typeof input[key] === "number" ? (input[key] as number) : undefined);
const scratch = (name: string) => path.join(ROOT ? path.join(ROOT, ".scratch") : path.join(os.tmpdir(), "attelier-motion"), `${Date.now()}-${name}`);

const sfxDir = () => path.resolve(path.dirname(fileURLToPath(import.meta.resolve("@attelier/motion/package.json"))), "assets", "sfx");

const TASTE_CATEGORIES = ["pacing", "music", "sound", "voice", "captions", "typography", "copy", "motion", "color", "branding", "subject", "structure", "review"];

export const LOCAL_TOOLS: LocalTool[] = [
  {
    name: "style_guide",
    description: "Attelier's taste for this video: the person's own lessons (learned from their past corrections) and Attelier's house lessons, by category (pacing, music, voice, captions, typography, words, brand, review). Read it before planning a video and again before delivering. Pass the motion format id to get its specific lessons.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "Motion format id (e.g. shootout) or kind of video." },
        projectId: { type: "string", description: "Include lessons the person narrowed to this project." },
      },
      additionalProperties: false,
    },
    run: async (input, api) => {
      const { houseTaste, tasteGuide } = await import("@atte/kit/taste");
      const format = typeof input.format === "string" && input.format.trim() ? input.format.trim() : undefined;
      const projectId = typeof input.projectId === "string" && input.projectId.trim() ? input.projectId.trim() : undefined;
      const house = houseTaste({ format });
      let person: Array<{ id: string; category: string; statement: string; format?: string }> = [];
      let note: string | undefined;
      if (api) {
        const query = new URLSearchParams({ ...(format ? { format } : {}), ...(projectId ? { projectId } : {}) }).toString();
        try {
          person = ((await api.get(`/v1/taste${query ? `?${query}` : ""}`)) as { lessons?: typeof person }).lessons ?? [];
        } catch (error) {
          note = `The person's own taste could not be read (${error instanceof Error ? error.message : String(error)}); house taste only.`;
        }
      }
      const guide = tasteGuide(house, person);
      return {
        structuredContent: { format: format ?? null, person, house: house.map(({ id, category, statement, strength, formats }) => ({ id, category, statement, strength, ...(formats ? { formats } : {}) })), ...(note ? { note } : {}) },
        content: [{ type: "text", text: note ? `${note}\n\n${guide}` : guide }],
      };
    },
  },
  {
    name: "record_preference",
    description: "Keep a lesson about how this person likes videos made, so every later video (web, Claude Code, Codex) starts from it. Call it when the person corrects how something looks, sounds, reads or is paced — not for facts, bugs or one-off content choices. Write the lesson as one imperative sentence that would apply to their next video, and pass their words as evidence. When style_guide already lists a lesson of theirs on the same point, pass its id as replaces to refine it instead of adding a second one.",
    inputSchema: {
      type: "object",
      properties: {
        statement: { type: "string", maxLength: 280, description: "The lesson as a rule, e.g. 'Fade the music out before the voice starts.'" },
        category: { type: "string", enum: TASTE_CATEGORIES },
        evidence: { type: "string", maxLength: 500, description: "The person's words that taught it." },
        format: { type: "string", description: "Only for this motion format or kind of video." },
        projectId: { type: "string", description: "Only for this project." },
        replaces: { type: "string", description: "Id of the person's existing lesson (from style_guide) that this one refines; it is removed once this one is saved." },
      },
      required: ["statement", "category", "evidence"],
      additionalProperties: false,
    },
    run: async (input, api) => {
      if (!api) throw new Error("Recording a preference needs a signed-in Attelier API connection.");
      const { replaces, ...lesson } = input;
      const saved = await api.post("/v1/taste", lesson);
      if (typeof replaces === "string" && replaces.trim()) await api.delete(`/v1/taste/${encodeURIComponent(replaces.trim())}`);
      return json(saved);
    },
  },
  {
    name: "motion_formats",
    description: "Discover tested Remotion formats. Use summaryOnly:true to choose, then format:<id> to read that format's guide and complete spec. Prefer a fitting format for designed motion; do not force a brief into an unrelated template. With no arguments returns all full guides for existing clients.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "One exact format id from the discovery list." },
        summaryOnly: { type: "boolean", description: "Only ids and summaries; omit guides and examples until a format is selected." },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      const { FORMATS } = await motion();
      if (input.summaryOnly !== undefined && typeof input.summaryOnly !== "boolean") throw new Error("summaryOnly must be a boolean.");
      if (input.format !== undefined && (typeof input.format !== "string" || !Object.hasOwn(FORMATS, input.format))) {
        throw new Error(`Unknown format. Choose one of: ${Object.keys(FORMATS).join(", ")}.`);
      }
      return json(Object.entries(FORMATS)
        .filter(([id]) => input.format === undefined || id === input.format)
        .map(([id, f]) => ({ id, summary: f.summary, ...(input.summaryOnly ? {} : { guide: f.guide, example: f.example }) })));
    },
  },
  {
    name: "motion_render",
    description: "Render a motion format from a spec with local media paths. stillAtSeconds renders one PNG (returned as an image) to check a moment in seconds; preview renders a fast half-size MP4; otherwise a 1080p MP4 with mastered audio (-1.5 dBTP) is written to output. The spec is validated first and errors say what to change.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "Format id from motion_formats." },
        spec: { type: "object", description: "The format spec; media fields are absolute local paths." },
        output: { type: "string", description: "Output path (.mp4, or .png with stillAtSeconds). Defaults to a temp file." },
        stillAtSeconds: { type: "number", minimum: 0 },
        preview: { type: "boolean" },
        profile: { type: "string", enum: ["web", "master"], description: "web (default): compact H.264 CRF 21 with mastered audio and fast start. master: CRF 17 for further editing." },
      },
      required: ["format", "spec"],
      additionalProperties: false,
    },
    run: async (input) => {
      const { renderFormat, FORMATS } = await motion();
      const format = String(input.format) as keyof typeof FORMATS;
      const still = num(input, "stillAtSeconds");
      const output = typeof input.output === "string" ? confined(input.output, "write") : scratch(still === undefined ? "render.mp4" : "still.png");
      // Every media file the spec names is read into the render, so it obeys the same folder.
      if (input.profile !== undefined && input.profile !== "web" && input.profile !== "master") throw new Error("profile: expected web or master.");
      const result = await renderFormat({ format, spec: input.spec, output, ...(input.profile ? { profile: input.profile } : {}), ...(ROOT ? { mediaRoots: [ROOT, sfxDir()] } : {}), ...(still === undefined ? {} : { stillAtSeconds: still }), ...(input.preview === true ? { preview: true } : {}) });
      return json(result, still === undefined ? [] : [result.output]);
    },
  },
  {
    name: "analyze_music",
    description: "Tempo, beat grid, bar levels, drops and breaks of a music file, plus suggestedOffsetBeats: where to start the track so a drop lands on alignBeat (default 16) while needSeconds of music remain. Copy beatSeconds, firstBeatSeconds and the offset into a format's music cue.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, needSeconds: { type: "number", minimum: 0 }, alignBeat: { type: "number", minimum: 0 } },
      required: ["path"],
      additionalProperties: false,
    },
    run: async (input) => {
      const { analyzeMusic } = await motion();
      const needSeconds = num(input, "needSeconds"), alignBeat = num(input, "alignBeat");
      return json(analyzeMusic(str(input, "path"), { ...(needSeconds === undefined ? {} : { needSeconds }), ...(alignBeat === undefined ? {} : { alignBeat }) }));
    },
  },
  {
    name: "probe_media",
    description: "Duration, video size/fps/codec, audio, hard cuts and loudness (LUFS, true peak) of a local media file.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    run: async (input) => {
      const { probeMedia } = await motion();
      return json(probeMedia(str(input, "path")));
    },
  },
  {
    name: "find_moments",
    description: "Where a clip is most alive: a normalized motion curve (frame-difference energy) and bestStart, the start of the windowSeconds span with the most motion. Use bestStart as a format's clip start, then confirm with contact_sheet.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, windowSeconds: { type: "number", exclusiveMinimum: 0 }, skipSeconds: { type: "number", minimum: 0 } },
      required: ["path", "windowSeconds"],
      additionalProperties: false,
    },
    run: async (input) => {
      const { findMoments } = await motion();
      const window = num(input, "windowSeconds") ?? 2;
      const skip = num(input, "skipSeconds");
      return json(findMoments(str(input, "path"), window, skip === undefined ? {} : { skipSeconds: skip }));
    },
  },
  {
    name: "contact_sheet",
    description: "A grid of frames from a local video, returned as an image: review a whole video or specific moments in one look. Use everySeconds for an overview or atSeconds for exact moments.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        everySeconds: { type: "number", exclusiveMinimum: 0 },
        atSeconds: { type: "array", items: { type: "number", minimum: 0 }, maxItems: 48 },
        columns: { type: "integer", minimum: 1, maximum: 12 },
        tileWidth: { type: "integer", minimum: 120, maximum: 960 },
        output: { type: "string" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    run: async (input) => {
      const { contactSheet } = await motion();
      const output = typeof input.output === "string" ? confined(input.output, "write") : scratch("sheet.png");
      const every = num(input, "everySeconds"), columns = num(input, "columns"), tileWidth = num(input, "tileWidth");
      const at = Array.isArray(input.atSeconds) ? (input.atSeconds as number[]) : undefined;
      const sheet = contactSheet(str(input, "path"), output, {
        ...(every === undefined ? {} : { everySeconds: every }),
        ...(at ? { atSeconds: at } : {}),
        ...(columns === undefined ? {} : { columns }),
        ...(tileWidth === undefined ? {} : { tileWidth }),
      });
      return json({ output: sheet }, [sheet]);
    },
  },
  {
    name: "review_video",
    description: "The automatic check of a finished render before delivering: flashes at transitions (frame brightness), black spans, judder (repeated frames in moving shots, e.g. 24 fps clips in a 30 fps edit), audio clipping, with plain-language issues to fix. Then look at every issue, and at the whole video, with contact_sheet.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    run: async (input) => {
      const { reviewVideo } = await motion();
      return json(reviewVideo(str(input, "path")));
    },
  },
  {
    name: "sfx_library",
    description: "Curated sound effects shipped with Attelier (UI clicks, typing, swishes, impacts, risers, logo stings, motorsport). Returns id, intended use and absolute path for custom edits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const dir = sfxDir();
      const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as { source: string; sounds: { id: string; use: string }[] };
      return json({ source: manifest.source, sounds: manifest.sounds.map((s) => ({ ...s, path: path.join(dir, `${s.id}.mp3`) })) });
    },
  },
];

export const localTool = (name: string) => LOCAL_TOOLS.find((tool) => tool.name === name);

/** Run a local tool; failures come back as tool errors the agent can act on. */
export const runLocalTool = async (tool: LocalTool, args: Record<string, unknown>, api?: LocalApi): Promise<LocalToolResult> => {
  try {
    return await tool.run(args, api);
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
  }
};
