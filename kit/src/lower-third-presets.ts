/**
 * The lower-third property sets from `skills/lower-thirds/SKILL.md`.
 *
 * These live in the kit rather than in the API because two surfaces apply the
 * same look: `add_lower_third` compiles them server-side for an agent, and the
 * Studio text panel offers them as a preset menu to a person. One definition
 * means the preset a person picks and the preset Atte writes are the same
 * pixels, and a correction to the skill lands in both at once.
 *
 * Pure by construction: no project, no transport, no storage — a canvas, some
 * text and (optionally) the project's font assets in, property records out.
 */

export const LOWER_THIRD_PRESETS = ["documentary-rule", "documentary-box", "minimal"] as const;
export type LowerThirdPreset = typeof LOWER_THIRD_PRESETS[number];

/** Reference canvas the pixel values in `skills/lower-thirds` are authored for. */
export const LOWER_THIRD_REFERENCE_CANVAS_WIDTH = 1920;

/** Normalize the role copy; the renderer applies real glyph tracking. */
export const trackedSmallCaps = (value: string): string =>
  value.toUpperCase().split(/\s+/).filter(Boolean).join(" ");

export type LowerThirdCanvas = { width: number; height: number };

/** The subset of an asset this module needs, so the kit stays schema-light. */
export type LowerThirdFontAsset = { id: string; name: string; mediaType: string };

/**
 * The project's documentary typefaces when present. The current Mirror look
 * uses Bricolage for the name and Inter for the role; legacy Playfair projects
 * retain their established name face as a fallback.
 */
export const lowerThirdFontAssetIds = (
  assets: readonly LowerThirdFontAsset[],
): { name?: string; role?: string } => {
  const match = (pattern: RegExp): string | undefined =>
    assets.find((asset) => asset.mediaType === "font" && pattern.test(asset.name))?.id;
  const serif = match(/bricolage/i) ?? match(/playfair/i) ?? match(/inter/i);
  const sans = match(/inter/i) ?? serif;
  return { ...(serif ? { name: serif } : {}), ...(sans ? { role: sans } : {}) };
};

export type LowerThirdPresetInput = {
  canvas: LowerThirdCanvas;
  preset: LowerThirdPreset;
  /** Drawn as-is on the name element. */
  name: string;
  /** Tracked to small caps on the role element when present. */
  role?: string | undefined;
  fonts?: { name?: string | undefined; role?: string | undefined } | undefined;
};

export type LowerThirdPresetProperties = {
  name: Record<string, unknown>;
  role?: Record<string, unknown>;
};

/**
 * The exact property sets for one lower third.
 *
 * Positions follow the canvas aspect: a 16:9 documentary may use the bottom
 * third; a vertical crop may not, so everything stays above the platform
 * interaction band. Pixel values scale with canvas width.
 */
export const lowerThirdPresetProperties = (
  input: LowerThirdPresetInput,
): LowerThirdPresetProperties => {
  const { canvas, preset } = input;
  const title = input.name.trim();
  const scale = canvas.width / LOWER_THIRD_REFERENCE_CANVAS_WIDTH;
  const px = (value: number): number => Math.max(1, Math.round(value * scale));
  const landscape = canvas.width >= canvas.height;
  const nameY = landscape ? 0.78 : 0.72;
  const roleY = landscape ? 0.845 : 0.775;
  const nameFontSize = px(56);
  const roleFontSize = px(26);

  const shared = {
    "text.align": "left",
    "text.role": "label",
    "style.fadeSeconds": 0.7,
    "effect.text.id": "atelier.text.readable-overlay",
    "effect.text.version": 1,
    "transform.opacity": 1,
    "transform.rotation": 0,
    "transform.scale": 1,
  } as const;

  const boxed = preset === "documentary-box";
  const ruled = preset === "documentary-rule";
  const name: Record<string, unknown> = {
    ...shared,
    "text.content": title,
    "text.boxed": boxed,
    "style.fontSize": nameFontSize,
    "style.fontWeight": 800,
    "style.lineHeight": 1.1,
    "style.color": "#FFFFFF",
    ...(input.fonts?.name ? { "style.fontAssetId": input.fonts.name } : {}),
    "style.stroke": 0,
    "style.shadowOpacity": boxed ? 0 : 0.35,
    "transform.position": [0.08, nameY],
    ...(ruled ? {
      "style.rule.width": px(4),
      "style.rule.height": px(96),
      "style.rule.gap": px(22),
      "style.rule.offsetY": -px(14),
      "style.rule.color": "#C9A227",
    } : {}),
    ...(boxed ? {
      "style.boxColor": "#0B0B0C",
      "style.boxOpacity": 0.45,
      "style.boxPadding": px(20),
      "style.boxRadius": px(14),
      // Pixels, never measured for you: this is the skill's starting value.
      // Correct it from render_frame.
      "style.boxWidth": px(Math.max(620, title.length * 34)),
      "style.boxHeight": Math.round((roleY - nameY) * canvas.height
        + nameFontSize * 0.75 + roleFontSize * 0.35),
    } : {}),
  };

  const role = input.role?.trim();
  if (!role) return { name };
  return {
    name,
    role: {
      ...shared,
      "text.content": trackedSmallCaps(role),
      "text.boxed": false,
      "style.fontSize": roleFontSize,
      "style.fontWeight": 600,
      "style.lineHeight": 1.15,
      "style.trackingEm": 0.12,
      "style.color": "#C9A227",
      ...(input.fonts?.role ? { "style.fontAssetId": input.fonts.role } : {}),
      "style.shadowOpacity": boxed ? 0 : 0.45,
      "transform.position": [0.08, roleY],
    },
  };
};
