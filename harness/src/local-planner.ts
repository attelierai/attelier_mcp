import type {
  MediaTime,
  Project,
  ProjectOperation,
  TimelineElement,
  Track,
} from "@attelier/project-schema";
import { assessMotionTreatment, type MotionTreatmentKind } from "@attelier/capability-schema/motion-treatment";
import { secondsToTicks, ticksToSeconds } from "@attelier/project-schema";
import { buildTransitionOperations } from "./transition-tools.js";
import { buildSplitEditOperations } from "./split-edit-tools.js";
import { buildColorMatchOperations } from "./color-match-tools.js";
import {
  buildExistingAssetPlacementOperations,
  buildTitleOperations,
  safeTitlePosition,
  type ExistingAssetPlacement,
} from "./composition-tools.js";

export {
  buildExistingAssetPlacementOperations,
  buildTitleOperations,
  safeTitlePosition,
};
export type { ExistingAssetPlacement };

/**
 * Deterministic natural-language planner (Spanish + English).
 *
 * This is the local tier of the agent brain: a rule-based intent parser that
 * emits canonical ProjectOperations. It exists so the editor is fully agentic
 * offline, and it defines the exact tool surface a hosted LLM planner
 * (Fable 5 / GPT tool-calling) drops into later — same inputs, same outputs,
 * every plan still goes through engine simulation before anything commits.
 */

export type PlannedEdit = {
  summary: string;
  operations: ProjectOperation[];
  targetId?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
};

export class PlanParseError extends Error {}

type PlanContext = {
  selectedElementId?: string;
  playheadSeconds: number;
};

const ticksOf = (seconds: number): MediaTime => secondsToTicks(seconds);

type LocatedElement = {
  element: TimelineElement;
  track: Track;
};

const activeSequence = (project: Project) =>
  project.sequences.find((sequence) => sequence.id === project.activeSequenceId);

const locateElement = (
  project: Project,
  elementId: string,
): LocatedElement | undefined => {
  for (const sequence of project.sequences) {
    for (const track of sequence.tracks) {
      const element = track.elements.find((candidate) => candidate.id === elementId);
      if (element) return { element, track };
    }
  }
  return undefined;
};

const nextSplitElementId = (project: Project, elementId: string): string => {
  const taken = new Set(
    project.sequences.flatMap((sequence) =>
      sequence.tracks.flatMap((track) =>
        track.elements.map((element) => element.id),
      ),
    ),
  );
  let index = 1;
  while (taken.has(`${elementId}-split-${index}`)) index += 1;
  return `${elementId}-split-${index}`;
};


/** "10s", "10 segundos", "1,5s", "2 min" → seconds */
const parseSeconds = (raw: string): number => {
  const value = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
};

const SECONDS_PATTERN = "(\\d+(?:[.,]\\d+)?)\\s*(?:s\\b|seg\\b|segs\\b|segundos?\\b|seconds?\\b|sec\\b)?";

const flattenElements = (project: Project) =>
  project.sequences.flatMap((sequence) =>
    sequence.tracks.flatMap((track) =>
      track.elements.map((element) => ({ sequence, track, element })),
    ),
  );

/** Resolve which element the instruction talks about. */
const resolveTarget = (
  project: Project,
  prompt: string,
  context: PlanContext,
): { element: TimelineElement; trackId: string } => {
  const all = flattenElements(project);
  if (all.length === 0) {
    throw new PlanParseError(
      "The timeline is empty. Add media first, then ask for an edit.",
    );
  }

  // 1) A quoted or fuzzy name mentioned in the prompt wins.
  const quoted = prompt.match(/[""«]([^""»]{2,60})[""»]/)?.[1]
    ?? prompt.match(/'([^']{2,60})'/)?.[1];
  const lowered = prompt.toLowerCase();
  const byName = all.find(({ element }) => {
    const name = element.name.toLowerCase();
    if (quoted && name.includes(quoted.toLowerCase())) return true;
    // Fuzzy: any 4+ char word of the element name appearing in the prompt.
    return name
      .split(/[^a-z0-9áéíóúñ]+/i)
      .some((word) => word.length >= 4 && lowered.includes(word));
  });
  if (byName) return { element: byName.element, trackId: byName.track.id };

  // 2) The explicit selection.
  if (context.selectedElementId) {
    const located = locateElement(project, context.selectedElementId);
    if (located) return { element: located.element, trackId: located.track.id };
  }

  // 3) The visual clip under the playhead, preferring video tracks.
  const playhead = context.playheadSeconds;
  const underPlayhead = all
    .filter(({ element }) => {
      const start = ticksToSeconds(element.timelineRange.start);
      const end = start + ticksToSeconds(element.timelineRange.duration);
      return playhead >= start && playhead < end;
    })
    .sort((left, right) =>
      (left.track.kind === "video" ? 0 : 1) - (right.track.kind === "video" ? 0 : 1),
    );
  const fallback = underPlayhead[0] ?? all[0];
  if (!fallback) throw new PlanParseError("No editable clip was found.");
  return { element: fallback.element, trackId: fallback.track.id };
};

const replaceWith = (
  element: TimelineElement,
  mutate: (draft: TimelineElement) => void,
): ProjectOperation => {
  const draft = structuredClone(element);
  mutate(draft);
  return { type: "replaceElement", elementId: element.id, element: draft };
};

const planSingleIntentLocally = (
  project: Project,
  rawPrompt: string,
  context: PlanContext,
): PlannedEdit => {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();
  const sequence = activeSequence(project);
  if (!sequence) throw new PlanParseError("This project has no active sequence.");

  // ---- add a title (no target needed) -------------------------------------
  const titleMatch =
    lower.match(/(?:añade|agrega|pon|crea|add|create)\s+(?:un\s+|una\s+|a\s+|the\s+|el\s+|la\s+)?(?:t[ií]tulo|texto|title|text|caption)/) &&
    (prompt.match(/[""«]([^""»]{1,80})[""»]/)?.[1] ??
      prompt.match(/"([^"]{1,80})"/)?.[1] ??
      prompt.match(/'([^']{1,80})'/)?.[1] ??
      prompt.match(/(?:diga|que ponga|saying|that says)\s+(.{1,80})$/i)?.[1]?.replace(/^["'«]|["'»]$/g, ""));
  if (titleMatch) {
    const text = titleMatch.trim().replace(/[.!]$/, "");
    const namedColors: Array<[RegExp, string]> = [
      [/\b(?:amarillo|yellow)\b/, "#ffcc00"],
      [/\b(?:blanco|white)\b/, "#ffffff"],
      [/\b(?:negro|black)\b/, "#000000"],
      [/\b(?:rojo|red)\b/, "#ff0000"],
      [/\b(?:azul|blue)\b/, "#0066ff"],
      [/\b(?:verde|green)\b/, "#00aa55"],
    ];
    const explicitColor = lower.match(/#[0-9a-f]{6}\b/i)?.[0]?.toLowerCase();
    const namedColor = namedColors.find(([pattern]) => pattern.test(lower))?.[1];
    const fontSizeMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*px\b/);
    const fontSize = fontSizeMatch?.[1] ? parseSeconds(fontSizeMatch[1]) : undefined;
    if (fontSize !== undefined && (fontSize < 8 || fontSize > 512)) {
      throw new PlanParseError("Title font size must be between 8 and 512 px.");
    }
    const color = explicitColor ?? namedColor;
    const style = {
      ...(color ? { color } : {}),
      ...(fontSize === undefined ? {} : { fontSize }),
    };
    return {
      summary: `Add the title “${text}” at the playhead`,
      operations: buildTitleOperations(project, text, context.playheadSeconds, 4, undefined, style),
      toolCalls: [{ name: "add_title", arguments: { text, at_seconds: context.playheadSeconds, duration_seconds: 4, ...(color ? { color } : {}), ...(fontSize === undefined ? {} : { font_size: fontSize }) } }],
    };
  }

  // ---- place an existing supplied asset (no generation/provider) ---------
  const wantsPlacement = /(?:añade|agrega|pon|coloca|inserta|add|place|insert)\b/.test(lower);
  const audioAssets = project.assets.filter(({ mediaType }) => mediaType === "audio");
  const audioIntent = /\b(?:audio|voz|voice|voiceover|locuci[oó]n|m[uú]sica|music|sound effect|sfx)\b/.test(lower);
  const namedAudio = audioAssets.find((asset) => lower.includes(asset.id.toLowerCase()) || lower.includes(asset.name.toLowerCase()));
  const semanticAudio = audioAssets.find((asset) =>
    (/\b(?:voz|voice|voiceover|locuci[oó]n)\b/.test(lower) && /voice|voz|locuci/i.test(`${asset.id} ${asset.name}`))
    || (/\b(?:m[uú]sica|music)\b/.test(lower) && /music|m[uú]sica/i.test(`${asset.id} ${asset.name}`)),
  );
  const suppliedAudio = namedAudio ?? semanticAudio ?? (audioIntent && audioAssets.length === 1 ? audioAssets[0] : undefined);
  if (wantsPlacement && suppliedAudio) {
    const startMatch = lower.match(/(?:desde|from|at|a partir de)\s*(\d+(?:[.,]\d+)?)\s*(?:s\b|seg|seconds?)?/);
    const atSeconds = startMatch?.[1] ? parseSeconds(startMatch[1]) : context.playheadSeconds;
    const role = /\b(?:m[uú]sica|music)\b/.test(lower) ? "music" as const : "voiceover" as const;
    const sequenceEndSeconds = Math.max(0, ...sequence.tracks.flatMap(({ elements }) => elements.map(({ timelineRange }) => ticksToSeconds(timelineRange.start) + ticksToSeconds(timelineRange.duration))));
    const sourceDuration = suppliedAudio.duration ? ticksToSeconds(suppliedAudio.duration) : undefined;
    const wholeVideo = /(?:todo el v[ií]deo|full video|entire video)/.test(lower);
    const durationSeconds = wholeVideo ? Math.min(sequenceEndSeconds - atSeconds, sourceDuration ?? Number.POSITIVE_INFINITY) : sourceDuration;
    const gainMatch = lower.match(/(-?\d+(?:[.,]\d+)?)\s*db\b/);
    const gainDb = gainMatch?.[1] ? parseSeconds(gainMatch[1]) : undefined;
    const sharedFade = lower.match(/fade[- ]?in.*?fade[- ]?out.*?(\d+(?:[.,]\d+)?)\s*(?:s\b|seg|seconds?)?/)
      ?? lower.match(/\bfades?\s*(?:de|of)?\s*(\d+(?:[.,]\d+)?)\s*(?:s\b|seg|seconds?)?/);
    const fadeInMatch = lower.match(/fade[- ]?in(?:.*?)(\d+(?:[.,]\d+)?)\s*(?:s\b|seg|seconds?)?/);
    const fadeOutMatch = lower.match(/fade[- ]?out(?:.*?)(\d+(?:[.,]\d+)?)\s*(?:s\b|seg|seconds?)?/);
    const fadeInSeconds = sharedFade?.[1] ? parseSeconds(sharedFade[1]) : fadeInMatch?.[1] ? parseSeconds(fadeInMatch[1]) : undefined;
    const fadeOutSeconds = sharedFade?.[1] ? parseSeconds(sharedFade[1]) : fadeOutMatch?.[1] ? parseSeconds(fadeOutMatch[1]) : undefined;
    const placement = { assetId: suppliedAudio.id, atSeconds, ...(durationSeconds === undefined ? {} : { durationSeconds }), audioRole: role, ...(gainDb === undefined ? {} : { gainDb }), ...(fadeInSeconds === undefined ? {} : { fadeInSeconds }), ...(fadeOutSeconds === undefined ? {} : { fadeOutSeconds }) };
    return {
      summary: `Place “${suppliedAudio.name}” at ${atSeconds.toFixed(2)}s`,
      operations: buildExistingAssetPlacementOperations(project, placement),
      targetId: suppliedAudio.id,
      toolCalls: [{ name: "place_asset", arguments: { asset_id: suppliedAudio.id, at_seconds: atSeconds, ...(durationSeconds === undefined ? {} : { duration_seconds: durationSeconds }), role, ...(gainDb === undefined ? {} : { gain_db: gainDb }), ...(fadeInSeconds === undefined ? {} : { fade_in_seconds: fadeInSeconds }), ...(fadeOutSeconds === undefined ? {} : { fade_out_seconds: fadeOutSeconds }) } }],
    };
  }

  const { element } = resolveTarget(project, prompt, context);
  const startSeconds = ticksToSeconds(element.timelineRange.start);
  const durationSeconds = ticksToSeconds(element.timelineRange.duration);

  // ---- transition to the next visual clip -------------------------------
  if (/transici[oó]n|cross[- ]?dissolve|fundido cruzado|disolvencia|dip[- ]to[- ](?:black|white)|fundido a (?:negro|blanco)/.test(lower)) {
    const kind = /dip[- ]to[- ]white|fundido a blanco/.test(lower)
      ? "dip-to-white"
      : /dip[- ]to[- ]black|fundido a negro/.test(lower)
        ? "dip-to-black"
        : "cross-dissolve";
    const durationMatch = lower.match(new RegExp(SECONDS_PATTERN));
    const transitionDuration = durationMatch?.[1] ? parseSeconds(durationMatch[1]) : 0.5;
    return {
      summary: `Apply ${kind} after “${element.name}” over ${transitionDuration.toFixed(2)}s`,
      operations: buildTransitionOperations(
        project,
        element.id,
        undefined,
        kind,
        transitionDuration,
      ),
      targetId: element.id,
      toolCalls: [{ name: "apply_transition", arguments: { outgoing_element_id: element.id, kind, duration_seconds: transitionDuration } }],
    };
  }

  // ---- split edit (audio leads or trails the picture cut) ----------------
  if (/\b[jl][ -]?cut\b|corte en [jl]\b/.test(lower)) {
    const kind = /\bj[ -]?cut\b|corte en j\b/.test(lower) ? "j-cut" : "l-cut";
    const durationMatch = lower.match(new RegExp(SECONDS_PATTERN));
    const splitDuration = durationMatch?.[1] ? parseSeconds(durationMatch[1]) : 0.5;
    return {
      summary: `Apply ${kind} after “${element.name}” over ${splitDuration.toFixed(2)}s`,
      operations: buildSplitEditOperations(
        project,
        element.id,
        undefined,
        kind,
        splitDuration,
      ),
      targetId: element.id,
    };
  }

  // ---- match selected/named clip to its previous visual reference --------
  if (/color match|match (?:the )?colou?r|iguala(?:r)? (?:el )?color|empareja(?:r)? (?:el )?color|haz que (?:el )?color coincida/.test(lower)) {
    return {
      summary: `Match the color of “${element.name}” to the previous visual clip`,
      operations: buildColorMatchOperations(project, element.id),
      targetId: element.id,
    };
  }

  // ---- render-only motion treatment -------------------------------------
  if (/\b(stabili[sz](?:e|ation|ing|ed)?|estabili[sz](?:a|ar|ado|aci[oó]n)?|motion blur|desenfoque de movimiento)\b/.test(lower)) {
    if (element.kind !== "video") throw new PlanParseError("Stabilization and motion blur require a selected video clip.");
    const wantsStabilization = /\b(stabili[sz](?:e|ation|ing|ed)?|estabili[sz](?:a|ar|ado|aci[oó]n)?)/.test(lower);
    const wantsMotionBlur = /\b(motion blur|desenfoque de movimiento)\b/.test(lower);
    const kind: MotionTreatmentKind = wantsStabilization && wantsMotionBlur ? "both" : wantsStabilization ? "stabilization" : "motion-blur";
    const preflight = assessMotionTreatment({ kind, properties: element.properties });
    if (preflight.status === "needs-action") throw new PlanParseError(preflight.reasons.join(" "));
    const strengthMatch = lower.match(/(?:strength|intensity|intensidad|fuerza)\s*(?:to|=|a)?\s*(\d+(?:[.,]\d+)?)/);
    const framesMatch = lower.match(/(\d+)\s*frames?/);
    const strength = Math.max(0, Math.min(1, strengthMatch?.[1] ? parseSeconds(strengthMatch[1]) : 0.5));
    const frames = Math.max(2, Math.min(5, Math.round(framesMatch?.[1] ? parseSeconds(framesMatch[1]) : 2)));
    const operations: ProjectOperation[] = [];
    if (wantsStabilization) operations.push(
      { type: "setProperty", elementId: element.id, path: "effect.stabilization.id", value: "atelier.motion.stabilization" },
      { type: "setProperty", elementId: element.id, path: "effect.stabilization.version", value: 1 },
      { type: "setProperty", elementId: element.id, path: "motion.stabilization.enabled", value: true },
      { type: "setProperty", elementId: element.id, path: "motion.stabilization.strength", value: strength },
    );
    if (wantsMotionBlur) operations.push(
      { type: "setProperty", elementId: element.id, path: "effect.motionBlur.id", value: "atelier.motion.motion-blur" },
      { type: "setProperty", elementId: element.id, path: "effect.motionBlur.version", value: 1 },
      { type: "setProperty", elementId: element.id, path: "motion.blur.enabled", value: true },
      { type: "setProperty", elementId: element.id, path: "motion.blur.frames", value: frames },
    );
    return {
      summary: `${wantsStabilization ? `Stabilize “${element.name}”` : ""}${wantsStabilization && wantsMotionBlur ? " and " : ""}${wantsMotionBlur ? `apply ${frames}-frame motion blur` : ""} · render-only proof required`,
      operations,
      targetId: element.id,
    };
  }

  // ---- delete -------------------------------------------------------------
  if (/(elimina|borra|quita|delete|remove)\b/.test(lower)) {
    const ripple = /(ripple|cierra el hueco|close the gap)/.test(lower);
    return {
      summary: `${ripple ? "Ripple-delete" : "Delete"} “${element.name}”`,
      operations: [
        ripple
          ? { type: "rippleDeleteElement", elementId: element.id }
          : { type: "deleteElement", elementId: element.id },
      ],
      targetId: element.id,
    };
  }

  // ---- split / cut at a point --------------------------------------------
  const splitMatch = lower.match(new RegExp(`(?:corta|divide|parte|split|cut)\\b(?:.*?(?:en|at)\\s+${SECONDS_PATTERN})?`));
  if (splitMatch && /(corta|divide|parte|split|cut)\b/.test(lower) && !/(recorta|trim)/.test(lower)) {
    const atSeconds = splitMatch[1] !== undefined
      ? parseSeconds(splitMatch[1])
      : /playhead|cursor/.test(lower)
        ? context.playheadSeconds
        : startSeconds + durationSeconds / 2;
    if (atSeconds <= startSeconds || atSeconds >= startSeconds + durationSeconds) {
      throw new PlanParseError(
        `“${element.name}” runs ${startSeconds.toFixed(2)}s–${(startSeconds + durationSeconds).toFixed(2)}s; a cut needs a point inside it.`,
      );
    }
    return {
      summary: `Cut “${element.name}” at ${atSeconds.toFixed(2)}s`,
      operations: [
        {
          type: "splitElement",
          elementId: element.id,
          at: ticksOf(atSeconds),
          rightElementId: nextSplitElementId(project, element.id),
        },
      ],
      targetId: element.id,
    };
  }

  // ---- trim to a duration -------------------------------------------------
  const trimMatch = lower.match(new RegExp(`(?:rec[oó]rta(?:lo|la)?|trim|ac[oó]rta(?:lo|la)?|shorten|deja(?:lo|la)? en)\\b.*?(?:a|to|en)?\\s*${SECONDS_PATTERN}`));
  if (trimMatch?.[1] && /(recorta|acorta|trim|shorten|deja)/.test(lower)) {
    const target = parseSeconds(trimMatch[1]);
    if (!Number.isFinite(target) || target <= 0) {
      throw new PlanParseError("Tell me the target duration, e.g. “recorta el clip a 5s”.");
    }
    if (target >= durationSeconds) {
      throw new PlanParseError(
        `“${element.name}” already lasts ${durationSeconds.toFixed(2)}s — trimming to ${target.toFixed(2)}s would not shorten it.`,
      );
    }
    const nextDuration = ticksOf(target);
    return {
      summary: `Trim “${element.name}” to ${target.toFixed(2)}s (from the end)`,
      operations: [
        {
          type: "trimElement",
          elementId: element.id,
          timelineRange: { start: element.timelineRange.start, duration: nextDuration },
          ...(element.sourceRange
            ? { sourceRange: { start: element.sourceRange.start, duration: nextDuration } }
            : {}),
        },
      ],
      targetId: element.id,
    };
  }

  // ---- move ---------------------------------------------------------------
  const moveAbs = lower.match(new RegExp(`(?:mueve|muévelo|muevela|move|coloca|pon)\\b.*?(?:(?:a|to)\\s+(?:los?\\s+)?|(?:empiece|comience|starts?)\\s+(?:en|at)\\s+)${SECONDS_PATTERN}`));
  const moveRel = lower.match(new RegExp(`(?:adelanta|atrasa|retrasa|mueve|move|shift)\\b.*?${SECONDS_PATTERN}\\s*(?:antes|earlier|atr[aá]s|despu[eé]s|later|adelante)`));
  if (/(mueve|muévelo|move|coloca|adelanta|atrasa|retrasa|shift)/.test(lower) && (moveAbs?.[1] ?? moveRel?.[1])) {
    let nextStart: number;
    if (moveRel?.[1]) {
      const delta = parseSeconds(moveRel[1]);
      const backwards = /(antes|earlier|atr[aá]s|adelanta)/.test(lower);
      nextStart = Math.max(0, startSeconds + (backwards ? -delta : delta));
    } else {
      nextStart = Math.max(0, parseSeconds(moveAbs![1]!));
    }
    return {
      summary: `Move “${element.name}” to ${nextStart.toFixed(2)}s`,
      operations: [
        { type: "moveElement", elementId: element.id, start: ticksOf(nextStart) },
      ],
      targetId: element.id,
    };
  }

  // ---- playback speed -----------------------------------------------------
  const speedMatch = lower.match(/(?:velocidad|speed|c[aá]mara (?:r[aá]pida|lenta)|slow ?motion|ac[eé]lera|ralentiza).*?(\d+(?:[.,]\d+)?)\s*[x×]?/)
    ?? lower.match(/(\d+(?:[.,]\d+)?)\s*[x×]\b/);
  if (speedMatch && /(velocidad|speed|slow|c[aá]mara|acelera|ralentiza|[x×])/.test(lower)) {
    const rate = parseSeconds(speedMatch[1]!);
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
      throw new PlanParseError("Playback speed must be between 0.25× and 4×.");
    }
    const previousRate = typeof element.properties["playback.rate"] === "number"
      ? Number(element.properties["playback.rate"])
      : 1;
    const sourceDuration = element.sourceRange
      ? Number(element.sourceRange.duration)
      : Math.round(Number(element.timelineRange.duration) * previousRate);
    return {
      summary: `Set “${element.name}” to ${rate}× speed`,
      operations: [
        replaceWith(element, (draft) => {
          draft.timelineRange.duration = String(Math.max(1, Math.round(sourceDuration / rate))) as MediaTime;
          draft.properties["playback.rate"] = rate;
          draft.properties["audio.preservePitch"] = true;
        }),
      ],
      targetId: element.id,
    };
  }

  // ---- zoom / scale -------------------------------------------------------
  const scaleMatch = lower.match(/(?:zoom|escala|scale|agranda|amplia|amplía)\b.*?(\d+(?:[.,]\d+)?)\s*(%)?/);
  if (scaleMatch?.[1]) {
    let scale = parseSeconds(scaleMatch[1]);
    if (scaleMatch[2] === "%" || scale > 10) scale /= 100;
    if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
      throw new PlanParseError("Scale must be between 0 and 10 (or 0–1000%).");
    }
    return {
      summary: `Scale “${element.name}” to ${scale}×`,
      operations: [
        { type: "setProperty", elementId: element.id, path: "transform.scale", value: scale },
      ],
      targetId: element.id,
    };
  }

  // ---- opacity ------------------------------------------------------------
  const opacityMatch = lower.match(/(?:opacidad|opacity|transparencia)\b.*?(\d+(?:[.,]\d+)?)\s*(%)?/);
  if (opacityMatch?.[1]) {
    let opacity = parseSeconds(opacityMatch[1]);
    if (opacityMatch[2] === "%" || opacity > 1) opacity /= 100;
    return {
      summary: `Set “${element.name}” opacity to ${Math.round(opacity * 100)}%`,
      operations: [
        { type: "setProperty", elementId: element.id, path: "transform.opacity", value: Math.max(0, Math.min(1, opacity)) },
      ],
      targetId: element.id,
    };
  }

  // ---- rotation -----------------------------------------------------------
  const rotateMatch = lower.match(/(?:rota|gira|rotate)\b.*?(-?\d+(?:[.,]\d+)?)\s*(?:grados|deg|°)?/);
  if (rotateMatch?.[1] && /(rota|gira|rotate)/.test(lower)) {
    const degrees = parseSeconds(rotateMatch[1]);
    return {
      summary: `Rotate “${element.name}” ${degrees}°`,
      operations: [
        { type: "setProperty", elementId: element.id, path: "transform.rotation", value: degrees },
      ],
      targetId: element.id,
    };
  }

  // ---- audio: mute / volume / fades --------------------------------------
  if (/(silencia|mute|sin sonido|quita el audio)/.test(lower)) {
    return {
      summary: `Mute “${element.name}”`,
      operations: [
        { type: "setProperty", elementId: element.id, path: "audio.muted", value: true },
      ],
      targetId: element.id,
    };
  }
  const gainMatch = lower.match(/(?:volumen|volume|gain)\b.*?(-?\d+(?:[.,]\d+)?)\s*db/);
  if (gainMatch?.[1]) {
    const db = parseSeconds(gainMatch[1]);
    return {
      summary: `Set “${element.name}” gain to ${db}dB`,
      operations: [
        { type: "setProperty", elementId: element.id, path: "audio.gainDb", value: db },
      ],
      targetId: element.id,
    };
  }
  const fadeMatch = lower.match(new RegExp(`fade[- ]?(in|out).*?${SECONDS_PATTERN}`));
  if (fadeMatch) {
    const seconds = fadeMatch[2] ? parseSeconds(fadeMatch[2]) : 1;
    const path = fadeMatch[1] === "in" ? "audio.fadeInSeconds" : "audio.fadeOutSeconds";
    return {
      summary: `Fade ${fadeMatch[1]} “${element.name}” over ${seconds}s`,
      operations: [
        { type: "setProperty", elementId: element.id, path, value: seconds },
      ],
      targetId: element.id,
    };
  }

  throw new PlanParseError(
    "I did not understand that edit yet. Try: “trim the clip to 5s”, “split at 3s”, “move the music to 2s”, “set speed to 2x”, “add a title that says Hello”, “set opacity to 50%”, “mute the music”.",
  );
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Split only at boundaries that introduce another independently understood
 * edit. This deliberately does not split phrases such as "fade in y fade out".
 */
const compoundClauses = (project: Project, prompt: string): string[] => {
  const actionBoundary = /\s+(?:y|and)\s+(?=(?:baja|reduce|set|pon|cambia|change|rec[oó]rta|trim|ac[oó]rta|shorten|mueve|mu[eé]velo|move|coloca|rota|gira|rotate|silencia|mute)\b)/gi;
  let clauses = prompt
    .split(/\s+(?:y\s+despu[eé]s|and\s+then|then)\s+/i)
    .flatMap((clause) => clause.split(actionBoundary));

  const audioNames = project.assets
    .filter(({ mediaType }) => mediaType === "audio")
    .flatMap(({ id, name }) => [id, name])
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
    .sort((left, right) => right.length - left.length);
  if (audioNames.length > 0) {
    const namedAudioBoundary = new RegExp(
      `\\s+(?:y|and)\\s+(?=(?:${audioNames.map(escapeRegExp).join("|")})(?:\\b|\\s))`,
      "gi",
    );
    clauses = clauses.flatMap((clause) => clause.split(namedAudioBoundary));
  }

  const placementVerb = "Add";
  const startsWithAudioName = audioNames.length > 0
    ? new RegExp(`^(?:${audioNames.map(escapeRegExp).join("|")})(?:\\b|\\s)`, "i")
    : undefined;
  const promptRequestsPlacement = /(?:añade|agrega|pon|coloca|inserta|add|place|insert)\b/i.test(prompt);
  return clauses
    .map((clause) => clause.trim().replace(/^[,;]\s*/, "").replace(/[,;]\s*$/, ""))
    .filter(Boolean)
    .map((clause, index) => index > 0 && promptRequestsPlacement && startsWithAudioName?.test(clause)
      ? `${placementVerb} ${clause}`
      : clause);
};

const mergeCompoundPlans = (plans: PlannedEdit[]): PlannedEdit => {
  const operations: ProjectOperation[] = [];
  const trackIdRemap = new Map<string, string>();
  const plannedTrackByKind = new Map<string, string>();
  for (const plan of plans) {
    for (const operation of plan.operations) {
      if (operation.type === "addTrack") {
        const existingTrackId = plannedTrackByKind.get(operation.track.kind);
        if (existingTrackId) {
          trackIdRemap.set(operation.track.id, existingTrackId);
          continue;
        }
        plannedTrackByKind.set(operation.track.kind, operation.track.id);
        operations.push(operation);
        continue;
      }
      if (operation.type === "insertElement") {
        operations.push({
          ...operation,
          trackId: trackIdRemap.get(operation.trackId) ?? operation.trackId,
        });
        continue;
      }
      operations.push(operation);
    }
  }
  return {
    summary: plans.map(({ summary }) => summary).join("; then "),
    operations,
    toolCalls: plans.flatMap(({ toolCalls }) => toolCalls ?? []),
  };
};

/** Plan every independently understood clause; explicit compounds fail closed. */
export const planLocally = (
  project: Project,
  rawPrompt: string,
  context: PlanContext,
): PlannedEdit => {
  const clauses = compoundClauses(project, rawPrompt.trim());
  if (clauses.length < 2) return planSingleIntentLocally(project, rawPrompt, context);
  try {
    return mergeCompoundPlans(clauses.map((clause) => planSingleIntentLocally(project, clause, context)));
  } catch (error) {
    throw new PlanParseError(`I could not complete every part of the compound edit: ${error instanceof Error ? error.message : String(error)}`);
  }
};
