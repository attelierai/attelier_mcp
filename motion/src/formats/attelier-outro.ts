// Format "attelier-outro": Attelier's own logo sign-off, appended to a video only
// when the person asks for it. Logo only, no tagline: black picture, a warm glow
// that blooms behind the lockup while it resolves from blur to sharp, an optional
// dark logo sting, then a short hold. Rendered once per aspect ratio into
// assets/brand/attelier-outro-{16x9,9x16,1x1}.mp4 for compositions to append.

export type OutroAspect = "16x9" | "9x16" | "1x1";

export type AttelierOutroSpec = {
  /** Frame shape; 16x9 is 1920×1080, 9x16 is 1080×1920, 1x1 is 1080×1080. */
  aspect?: OutroAspect;
  /** Total length in seconds (1.2–3, default 1.8). */
  seconds?: number;
  fps?: 30 | 60;
  /** The house dark logo sting under the reveal (default true). */
  sting?: boolean;
};

export const OUTRO_SIZES: Record<OutroAspect, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
  "1x1": { width: 1080, height: 1080 },
};

export const ATTELIER_OUTRO_EXAMPLE: AttelierOutroSpec = { aspect: "16x9", seconds: 1.8, fps: 30, sting: true };

export const attelierOutroDurationSeconds = (spec: AttelierOutroSpec) => spec.seconds ?? 1.8;

export const validateAttelierOutro = (spec: AttelierOutroSpec): string[] => {
  const errors: string[] = [];
  if (spec.aspect !== undefined && !(spec.aspect in OUTRO_SIZES)) errors.push(`aspect: expected one of ${Object.keys(OUTRO_SIZES).join(", ")}.`);
  if (spec.seconds !== undefined && (typeof spec.seconds !== "number" || spec.seconds < 1.2 || spec.seconds > 3)) errors.push("seconds: the outro lasts 1.2–3 s.");
  if (spec.sting !== undefined && typeof spec.sting !== "boolean") errors.push("sting: expected true or false.");
  return errors;
};
