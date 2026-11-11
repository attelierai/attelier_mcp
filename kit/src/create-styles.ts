/** Small, authored visual recipes shared by Create, the API and future Atte callers. */
export const CREATE_STYLE_VERSION = 1;
export const CREATE_STYLE_CAPABILITIES = ["text_to_image", "image_to_image", "product_shot"] as const;

export const CREATE_STYLES = [
  { id: "anime", name: "Anime", description: "Clean lines, painted worlds", recipe: "Render as a polished 2D anime illustration: controlled line weight, clean cel shading, coherent character proportions, a readable silhouette and a painted background with a clear focal hierarchy." },
  { id: "watercolor", name: "Watercolor", description: "Soft washes, paper texture", recipe: "Render as a traditional watercolor illustration on subtly textured paper: translucent pigment washes, varied soft and crisp edges, restrained layering and selective detail around the focal subject." },
  { id: "pixel-art", name: "Pixel art", description: "Crisp pixels, deliberate detail", recipe: "Render as intentional pixel art: a consistent coarse pixel grid, crisp pixel edges, readable clusters, a limited harmonious palette and selective dithering. Keep detail at the same pixel scale throughout." },
  { id: "3d-render", name: "3D render", description: "Tactile shapes, soft light", recipe: "Render as a polished stylized 3D scene: coherent sculpted forms, tactile materials, believable contact shadows, soft global illumination and a clear silhouette. Keep material scale and lighting consistent." },
  { id: "cinematic", name: "Cinematic", description: "Natural texture, film depth", recipe: "Render as a cinematic photographic still: motivated directional lighting, natural material texture, controlled highlight rolloff, coherent perspective and subtle atmospheric depth. Let the requested scene determine the mood and palette." },
  { id: "product-photo", name: "Product photo", description: "Precise detail, studio polish", recipe: "Render as premium product photography: faithful product geometry, precise material detail, controlled studio reflections and a clean visual hierarchy. Preserve supplied logos, labels and colors. Use an uncluttered background only when the user has not specified an environment." },
] as const;

export type CreateStyleId = typeof CREATE_STYLES[number]["id"];
export type CreateStyle = typeof CREATE_STYLES[number];
export type CreateStyleSource = { id: CreateStyleId; version: number; sourcePrompt: string };
export const createStyleById = (id: unknown): CreateStyle | undefined => CREATE_STYLES.find((style) => style.id === id);
export const supportsCreateStyle = (capability: string): boolean =>
  (CREATE_STYLE_CAPABILITIES as readonly string[]).includes(capability);

/** Recover a reusable source from persisted job input or asset provenance. */
export const readCreateStyleSource = (value: unknown): CreateStyleSource | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = value as Record<string, unknown>;
  const style = createStyleById(source.id);
  if (!style || source.version !== CREATE_STYLE_VERSION || typeof source.sourcePrompt !== "string" || !source.sourcePrompt.trim() || source.sourcePrompt.length > 6_000) return;
  return { id: style.id, version: CREATE_STYLE_VERSION, sourcePrompt: source.sourcePrompt };
};

/** Pure and idempotent: the original text is authoritative, never an already expanded prompt. */
export const compileCreateStyleInput = (capability: string, input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input) || !("createStyle" in input)) return input;
  const source = readCreateStyleSource(input.createStyle);
  if (!source) throw new Error("This image style is unavailable or out of date. Choose a style again.");
  if (!supportsCreateStyle(capability)) throw new Error("Styles are available for image generation and image restyling only.");
  const style = createStyleById(source.id)!;
  const reference = capability === "text_to_image" ? "" : "Restyle the provided image while preserving its subjects, identity and layout, except for changes explicitly requested below.\n\n";
  return {
    ...input,
    prompt: `${reference}Creator's request:\n${source.sourcePrompt.trim()}\n\nVisual treatment:\n${style.recipe}\n\nPreserve the creator's explicit content, exact wording, counts, colors and restrictions. Those requirements take precedence over stylistic defaults. Do not add subjects, props or lettering that were not requested.`,
    createStyle: source,
  };
};
