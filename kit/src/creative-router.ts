/**
 * Provider-independent routing for creative chat requests.
 *
 * This module deliberately has no Studio or transport dependencies so the UI,
 * CLI and MCP server execute the same versioned classification contract.
 */
export const ATTELIER_CREATIVE_ROUTER_VERSION = "1.0.0";

export type GenerationIntent = { kind: "voice" | "image" | "video"; content: string };
export type TranscriptIntent =
  | { kind: "transcribe" }
  | { kind: "cleanup"; what: "fillers" | "silences" | "repetitions" }
  | { kind: "captions" };
export type MediaOpIntent =
  | { kind: "music"; content: string }
  | { kind: "sfx"; content: string }
  | { kind: "upscale" }
  | { kind: "removebg" };

export type CreativePromptPlan = {
  routerVersion: typeof ATTELIER_CREATIVE_ROUTER_VERSION;
  generation: GenerationIntent;
  audio?: Extract<MediaOpIntent, { kind: "music" | "sfx" }>;
  resolutionId?: string;
  animateAfterImage?: { motion: string };
  wantsCaptions: boolean;
};

export const quotedText = (prompt: string): string | undefined =>
  prompt.match(/[“”«]([^“”»]{1,600})[“”»]/)?.[1] ??
  prompt.match(/"([^"]{1,600})"/)?.[1] ??
  prompt.match(/'([^']{1,600})'/)?.[1];

export const detectGeneration = (prompt: string): GenerationIntent | undefined => {
  const lower = prompt.toLowerCase();
  const strongCreate = /\b(genera(?:me)?|gener[aá]me|generar|crea(?:me)?|cr[eé]ame|crear|produce|producir|generate|create|make)\b/;
  const makeNew = /\b(hazme|haz|hacer|haces|hacedme|podr[ií]as hacer|puedes hacer)\s+(?:un|una|unos|unas)\s+/;
  const wantsNew = /\b(quiero|quisiera|necesito|me gustar[ií]a)\s+(?:crear|generar|hacer|producir\s+)?(?:un|una|unos|unas)\s+/;
  const asksToCreate = strongCreate.test(lower) || makeNew.test(lower) || wantsNew.test(lower);
  if (/\b(añade|añadir|agrega|agregar|pon|ponme|genera|generar|crea|crear|graba|grabar|quiero|necesito|add|create|make|haz|hazme)\b.*(voz en off|voiceover|locuci[oó]n|narraci[oó]n)/.test(lower) || /\bnarra\b/.test(lower)) {
    const content = quotedText(prompt) ?? prompt.match(/(?:que diga|diciendo|saying|that says)\s+(.{2,600})$/i)?.[1]?.trim();
    return { kind: "voice", content: content?.replace(/[.!]$/, "") ?? "" };
  }
  if (asksToCreate && /\b(imagen|image|foto|photo|picture)\b/.test(lower)) {
    const content = quotedText(prompt) ?? prompt.match(/(?:imagen|image|foto|photo|picture)\s+(?:de\s+|del\s+|de la\s+|of\s+|con\s+|showing\s+)?(.{2,600})$/i)?.[1]?.trim();
    return { kind: "image", content: content?.replace(/[.!?]+$/, "") ?? "" };
  }
  if (asksToCreate && /\b(v[ií]deo|clip)\b/.test(lower)) {
    const content = quotedText(prompt) ?? prompt.match(/(?:v[ií]deo|clip)\s+(?:de\s+|del\s+|de la\s+|of\s+|con\s+|showing\s+)?(.{2,600})$/i)?.[1]?.trim();
    return { kind: "video", content: content?.replace(/[.!?]+$/, "") ?? "" };
  }
  if (asksToCreate && /\b(anuncio|spot|comercial|commercial|advert|publicidad|tr[aá]iler|videoclip|music video)\b/.test(lower)) {
    return { kind: "video", content: quotedText(prompt) ?? prompt.trim() };
  }
  return undefined;
};

export const detectMediaOp = (prompt: string): MediaOpIntent | undefined => {
  const lower = prompt.toLowerCase();
  const withoutDependentSteps = (content: string) => content
    .replace(/\s+(?:y|and)\s+(?:con\s+)?(?:subt[ií]tulos|captions?|an[ií]ma(?:la|lo)?|animate)\b.*$/i, "")
    .trim()
    .replace(/[.!?]+$/, "");
  if (/\bsfx\b|efecto de sonido|efectos de sonido/.test(lower) || (/\b(añade|añadir|agrega|agregar|pon|ponme|genera|generar|crea|crear|mete|quiero|necesito|add|create|generate)\b/.test(lower) && /\b(un |el )?(sonido|sound)\b/.test(lower))) {
    const content = quotedText(prompt) ?? prompt.match(/(?:sonido|sound|sfx)\s+(?:de\s+|of\s+|como\s+)?(.{2,200})$/i)?.[1]?.trim() ?? "";
    return { kind: "sfx", content: withoutDependentSteps(content) };
  }
  if (/\b(añade|añadir|agrega|agregar|pon|ponme|genera|generar|crea|crear|mete|quiero|quisiera|necesito|add|create|generate|want|need)\b.*\b(m[uú]sica|music|banda sonora|soundtrack|canci[oó]n)\b/.test(lower) || /\b(con|with)\s+(?:una?\s+)?\b(m[uú]sica|music|banda sonora|soundtrack)\b/.test(lower)) {
    const content = quotedText(prompt) ?? prompt.match(/(?:m[uú]sica|music|banda sonora|soundtrack|canci[oó]n)\s+(?:de\s+|con\s+|estilo\s+|tipo\s+|that is\s+)?(.{2,300})$/i)?.[1]?.trim() ?? "";
    return { kind: "music", content: withoutDependentSteps(content) };
  }
  if (/(upscale|mejora la calidad|sube la (resoluci[oó]n|calidad)|m[aá]s (calidad|n[ií]tid)|enhance|4k|hd)\b/.test(lower)) return { kind: "upscale" };
  if (/(quita|quitar|elimina|eliminar|borra|borrar|remove)\b.*\b(fondo|background|bg)\b/.test(lower)) return { kind: "removebg" };
  return undefined;
};

export const detectAnimate = (prompt: string): { motion: string } | undefined => {
  const lower = prompt.toLowerCase();
  const isAnimate = /\banima\b|\banímala\b|\banimala\b|\banimate\b/.test(lower) ||
    (/(convierte|convertir|transforma|haz|crea)/.test(lower) && /(imagen|image|foto)/.test(lower) && /(en (un )?(v[ií]deo|clip)|to (a )?video|image to video)/.test(lower)) ||
    /image.?to.?video|img2vid|i2v/.test(lower);
  if (!isAnimate) return undefined;
  return { motion: quotedText(prompt) ?? prompt.match(/(?:con|with|moviendo|que|donde)\s+(.{3,300})$/i)?.[1]?.trim() ?? "" };
};

export const detectReframe = (prompt: string): { resolutionId: string } | undefined => {
  const lower = prompt.toLowerCase();
  if (/\b(en (un )?v[ií]deo|a v[ií]deo|to video|image.?to.?video)\b/.test(lower)) return undefined;
  const isReframe = /\b(reencuadr|reframe|formato|aspect|relaci[oó]n de aspecto|p[aá]sa(lo)?|convi[eé]rte(lo)?|ponlo|hazlo vertical|hazlo horizontal)\b/.test(lower) || /(vertical|horizontal|cuadrad|apaisad)/.test(lower);
  if (!isReframe) return undefined;
  if (/(9:16|vertical|tiktok|reels?|stories|shorts)/.test(lower)) return { resolutionId: "9:16" };
  if (/(4:5|feed)/.test(lower) || /\bformato (retrato|vertical)\b/.test(lower)) return { resolutionId: "4:5" };
  if (/(1:1|cuadrad|square)/.test(lower)) return { resolutionId: "1:1" };
  if (/(16:9|horizontal|apaisad|youtube|landscape)/.test(lower)) return { resolutionId: "16:9" };
  return undefined;
};

export const detectTranscript = (prompt: string): TranscriptIntent | undefined => {
  const lower = prompt.toLowerCase();
  if (/(transcribe|transcr[ií]be|transcripci[oó]n|\btranscript\b)/.test(lower)) return { kind: "transcribe" };
  const removing = /(borra|borrar|quita|quitar|elimina|eliminar|corta|cortar|limpia|limpiar|acorta|acortar|remove|delete|clean|shorten|reduce)/.test(lower);
  if (removing && /(silencios?|silences?|pausas|dead air)/.test(lower)) return { kind: "cleanup", what: "silences" };
  if (removing && /(muletillas|fillers?|\bum+s?\b|\beh+s?\b)/.test(lower)) return { kind: "cleanup", what: "fillers" };
  if (removing && /(repeticiones|repetitions|frases repetidas)/.test(lower)) return { kind: "cleanup", what: "repetitions" };
  if (/(añade|añadir|agrega|agregar|pon|ponme|genera|generar|crea|crear|quiero|necesito|add|create|generate|want|need)/.test(lower) && /(subt[ií]tulos|subtitles?|captions?)/.test(lower)) return { kind: "captions" };
  return undefined;
};

export const planCreativePrompt = (prompt: string): CreativePromptPlan | undefined => {
  const detectedGeneration = detectGeneration(prompt);
  if (!detectedGeneration) return undefined;
  const media = detectMediaOp(prompt);
  const animate = detectAnimate(prompt);
  const reframe = detectReframe(prompt);
  const content = detectedGeneration.content
    .replace(/\s+(?:y\s+)?an[ií]ma(?:la|lo)?(?:\s+.*)?$/i, "")
    .replace(/\s+(?:y\s+|con\s+)(?:una?\s+)?(?:m[uú]sica|banda sonora|soundtrack|music)\b.*$/i, "")
    .trim();
  const generation: GenerationIntent = { ...detectedGeneration, content };
  return {
    routerVersion: ATTELIER_CREATIVE_ROUTER_VERSION,
    generation,
    ...(media?.kind === "music" || media?.kind === "sfx" ? { audio: media } : {}),
    ...(reframe ? { resolutionId: reframe.resolutionId } : {}),
    ...(generation.kind === "image" && animate ? { animateAfterImage: animate } : {}),
    wantsCaptions: detectTranscript(prompt)?.kind === "captions",
  };
};

export type ProposalAction = "apply" | "discard";

export const detectProposalAction = (prompt: string): ProposalAction | undefined => {
  const lower = prompt.toLowerCase().trim().replace(/[.!?]+$/, "");
  if (/^(aplica(?:lo|la)?|acepta(?:lo|la)?|confirma(?:lo|la)?|apply|accept|confirm|s[ií])$/.test(lower)) return "apply";
  if (/^(desc[aá]rta(?:lo|la)?|rechaza(?:lo|la)?|cancela(?:lo|la)?|discard|reject|cancel|no)$/.test(lower)) return "discard";
  return undefined;
};
