export type MotionComposition = {
  code: string;
  width: number; height: number; fps: number; durationInFrames: number;
  props: Record<string, unknown>;
};
export type MotionRenderMode = { stillAtSeconds?: number; rangeSeconds?: [number, number]; preview?: boolean };
export const compositionScale = (composition: MotionComposition, mode: MotionRenderMode) =>
  mode.preview && composition.width % 4 === 0 && composition.height % 4 === 0 ? 0.5 : 1;

/** One TSX module keeps source portable. Imports use the installed, pinned runtime. */
export const validateComposition = (value: unknown): MotionComposition => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("composition must be an object.");
  const input = value as Record<string, unknown>;
  if (typeof input.code !== "string" || !input.code.trim() || Buffer.byteLength(input.code) > 256 * 1024) throw new Error("code must be a TSX module of at most 256 KiB, exporting the component as default.");
  for (const key of ["width", "height", "fps", "durationInFrames"]) if (!Number.isSafeInteger(input[key])) throw new Error(`${key} must be an integer.`);
  const { width, height, fps, durationInFrames } = input as unknown as MotionComposition;
  if (width < 16 || height < 16 || width > 1920 || height > 1920 || width % 2 || height % 2) throw new Error("Use even dimensions between 16 and 1920 pixels.");
  if (fps < 1 || fps > 60 || durationInFrames < 1 || durationInFrames > fps * 180) throw new Error("Use 1–60 fps and a duration of at most 180 seconds.");
  const props = input.props ?? {};
  if (!props || typeof props !== "object" || Array.isArray(props) || Buffer.byteLength(JSON.stringify(props)) > 64 * 1024) throw new Error("props must be a JSON object of at most 64 KiB.");
  if (Object.hasOwn(props, "media")) throw new Error("props.media is reserved for the project's media bindings.");
  return { code: input.code, width, height, fps, durationInFrames, props: props as Record<string, unknown> };
};

export const compositionFrames = (composition: MotionComposition, mode: MotionRenderMode): number | [number, number] => {
  if (mode.stillAtSeconds !== undefined && mode.rangeSeconds !== undefined) throw new Error("Choose a still or a range, not both.");
  const duration = composition.durationInFrames / composition.fps;
  const valid = (time: number) => Number.isFinite(time) && time >= 0 && time < duration;
  if (mode.stillAtSeconds !== undefined) {
    if (!valid(mode.stillAtSeconds)) throw new Error("stillAtSeconds is outside this composition.");
    return Math.floor(mode.stillAtSeconds * composition.fps);
  }
  if (mode.rangeSeconds !== undefined) {
    const [start, end] = mode.rangeSeconds;
    if (mode.rangeSeconds.length !== 2 || !valid(start) || !Number.isFinite(end) || end <= start || end > duration) throw new Error("rangeSeconds must be [start, end] inside this composition.");
    return [Math.floor(start * composition.fps), Math.min(composition.durationInFrames - 1, Math.ceil(end * composition.fps) - 1)];
  }
  return [0, composition.durationInFrames - 1];
};
