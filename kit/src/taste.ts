/**
 * Attelier's taste: what makes a video look made with care, learned from real
 * corrections and kept as short, specific lessons an agent reads before it
 * plans and again before it delivers.
 *
 * Three layers, most specific wins when two disagree:
 * - house: this file. Curated by the team from feedback on real videos; every
 *   lesson carries the words that taught it. It changes by review, like code.
 * - person: each account's own lessons, stored by the Attelier API
 *   (`/v1/taste`) and recorded when that person corrects a video.
 * - project: a person's lesson narrowed to one project.
 *
 * A lesson graduates as it proves itself: from a note an agent reads, to a
 * default in a motion format, to code and a test. Lessons that became defaults
 * say so in `enforcedBy`, so nobody re-teaches what the format already does.
 */

export const TASTE_CATEGORIES = ["pacing", "music", "sound", "voice", "captions", "typography", "copy", "motion", "color", "branding", "subject", "structure", "review"] as const;
export type TasteCategory = (typeof TASTE_CATEGORIES)[number];

export type TasteLesson = {
  id: string;
  category: TasteCategory;
  /** The rule, in the imperative, as the agent should apply it. */
  statement: string;
  /** The feedback that taught it (the person's words, lightly trimmed) and when. */
  evidence: { quote: string; source: string };
  /** Motion format ids or kinds of video it applies to; absent means every video. */
  formats?: readonly string[];
  /** "rule": do not break it without being asked. "default": the usual choice, open to a brief. */
  strength: "rule" | "default";
  /** Where a lesson became behaviour (a format default, a check), when it has. */
  enforcedBy?: string;
};

const from = (quote: string, source = "rally shootout and making-of sessions, 2026-09-23/24") => ({ quote, source });

export const HOUSE_TASTE: readonly TasteLesson[] = [
  // What the video is about
  { id: "subject-bold", category: "subject", strength: "default", statement: "For product and tech posts, pick bold, energetic subjects (motorsport, action, strong motion) over soft or cute ones.", evidence: from("Está guay pero demasiado suave; lo haría igual pero más guay, moderno y movidito, quizás un vídeo de coches de rally.") },
  { id: "modern-edit", category: "motion", strength: "rule", statement: "Edit like a current social video: titles that move, cuts on the beat, punchy sound. Plain lower thirds, static text and library-sounding music read as dated.", evidence: from("La música, los rótulos, el texto, la edición: todo anticuado. Compáralo con un vídeo social actual.") },
  { id: "concept-first", category: "structure", strength: "rule", statement: "Agree the concept and script with the person before generating or editing anything.", evidence: from("Quiero primero que hablemos de la idea y luego que te encargues tú.") },
  { id: "real-numbers", category: "structure", strength: "rule", statement: "When comparing models, show real generation times and costs from the jobs themselves; never invent or round them into claims.", evidence: from("Podemos añadir coste."), formats: ["shootout", "evolution"], enforcedBy: "shootout format: real numbers are required fields" },
  { id: "worst-to-best", category: "structure", strength: "default", statement: "Tell an evolution story from worst to best, so quality climbs to the end.", evidence: from("La mejor forma es de menos a más."), formats: ["evolution"] },

  // Pacing
  { id: "let-it-breathe", category: "pacing", strength: "rule", statement: "Let each shot breathe: about 3 seconds or more per subject so it can be judged. Drop a whole section rather than rush every section.", evidence: from("Cambia muy rápido entre uno y otro. Quita entero lo de night, más tiempo para ver cada clip de cada modelo."), formats: ["shootout"] },
  { id: "grid-long-enough", category: "pacing", strength: "default", statement: "Hold a side-by-side grid long enough to compare before moving on to charts or text.", evidence: from("Más tiempo el grid y luego ya pasar a lo de la gráfica."), formats: ["shootout"] },
  { id: "trim-the-end", category: "pacing", strength: "default", statement: "When it runs long, shorten the ending first.", evidence: from("Hacerlo un pelín más corto en general, quizás la última parte.") },

  // Music and sound
  { id: "music-clears-voice", category: "music", strength: "rule", statement: "Ads, promos and launches keep the music under the voice, ducked about 18 dB while it speaks, so cuts still land on the beat. Only narrative pieces (documentary, story, making-of) fade the music out before the voice and never overlap it.", evidence: from("La música tiene que irse mucho antes en fade out. Se superpone a la voz.") },
  { id: "music-marks-sections", category: "music", strength: "default", statement: "Let the music fade at a section change (a title like 'how it was made') instead of running across it.", evidence: from("La música debería desvanecerse al poner el how we made it.") },
  { id: "hero-track-stays", category: "music", strength: "default", statement: "Keep a hero track for its own part of the video; don't lay another bed under the narrated middle unless asked.", evidence: from("Quitaría la música del medio del vídeo, pero no la del vídeo de los coches.") },
  { id: "sfx-follows-motion", category: "sound", strength: "rule", statement: "A sound effect lasts exactly as long as the motion it belongs to (a timer sound runs until the last bar stops).", evidence: from("Cuando suena el sonidito de la barra de tiempo y precio, que suene hasta que la última barra termina."), formats: ["shootout"] },
  { id: "vary-the-sound", category: "sound", strength: "default", statement: "Vary music and sound effects between videos of the same format so each feels its own.", evidence: from("Quizás otra música y otros efectos de sonido para hacerlo diferente.") },

  // Voice
  { id: "narration-voice", category: "voice", strength: "default", statement: "Use a narration voice (Attelier's pick: ElevenLabs 'hank'), and offer two or three to choose from before committing. Voices are passed by voice id, never by name: without a known id, omit voiceId and the default narration voice is used.", evidence: from("No me gusta la voz: usa una de narración o dame a elegir. Usa hank.") },
  { id: "say-attelier-right", category: "voice", strength: "rule", statement: "Pronounce Attelier like the French 'atelier' (a-teh-LYEH) and Atte as 'AT-tee'; spell them phonetically for text-to-speech.", evidence: from("Attelier se pronuncia 'Ateliierrr'. Atte se pronuncia 'Atteee', no 'At'.") },
  { id: "voice-on-cue", category: "voice", strength: "rule", statement: "Start narrating a thing when it appears on screen, not before.", evidence: from("Que empiece a hablar cuando sale lo de Studio, no antes.") },
  { id: "spoken-signoff", category: "voice", strength: "default", statement: "Sign off by voice ('Now live on attelier.ai') and let the end card stay quiet, rather than writing the sign-off.", evidence: from("Lo de 'now live in Attelier' quería que lo dijese la voz, no escrito, como despedida.") },

  // Captions and type
  { id: "captions-choice", category: "captions", strength: "default", statement: "Captions are a taste call: keep them centered and offer two styles (bold word-by-word like CapCut, or quiet documentary lines) before settling.", evidence: from("Captions en el medio y igual que los que pone CapCut… Los captions no me convencen."), formats: ["making-of"] },
  { id: "highlight-not-box", category: "typography", strength: "rule", statement: "Highlight the key word (a date, a month, a number) with its own colour and a larger size; never with a filled box behind it.", evidence: from("Pon el mes en distinto color o estilo, pero no me convence lo del rectángulo naranja. Más grande el mes.") },
  { id: "no-wall-of-white", category: "typography", strength: "default", statement: "Avoid screens of plain white text; give each line one point of emphasis.", evidence: from("Pon algún highlight: mucho texto blanco y similar.") },
  { id: "no-period-in-titles", category: "typography", strength: "rule", statement: "No full stop after a year or a short title.", evidence: from("Quita el punto después de 2026."), enforcedBy: "motion_render warns about a title that ends with a full stop" },

  // Words
  { id: "neutral-question", category: "copy", strength: "rule", statement: "Closing questions stay neutral; don't steer the viewer to an answer.", evidence: from("Mejora el 'which one you prefer'… No me gusta, más neutro.") },
  { id: "ending-line", category: "copy", strength: "default", statement: "End on a short line with a point of view ('This is the worst it will ever be') or a clear call to try it, not on instructions like 'download it and post'.", evidence: from("Al final algo motivacional… 'The download it and post' no me gusta, quizás 'then you are ready to go'.") },

  // Brand
  { id: "end-card", category: "branding", strength: "rule", statement: "The end card is the client's brand: their logo large, a smaller line below, their call to action. The Attelier logo only on Attelier's own videos (with the credit, e.g. 'Claude Opus 5.5 + Attelier API') or when asked for the attelier-outro. Never credit fal or Higgsfield.", evidence: from("Pon Claude Opus 5.5 + Attelier API + Attelier MCP. El logo un poco más grande y el subtexto algo más pequeño, un pelín más abajo.") },
  { id: "product-ui-style", category: "branding", strength: "default", statement: "When the product appears, use Attelier's own fonts and UI style (the Studio composer) for on-screen interface moments.", evidence: from("Usaría la font y el estilo de Studio, incluso lo escribiría en el propio input de Create.") },

  // Before delivering
  { id: "check-transitions", category: "review", strength: "rule", statement: "Before delivering, check every transition frame by frame for flashes, glitches and pops.", evidence: from("En el 0.38 hay un efecto raro, como un destello. Quítalo."), enforcedBy: "review_video flags flashes, black spans, judder and clipping in a render" },
  { id: "screen-recordings", category: "review", strength: "rule", statement: "In product screen recordings, show the whole screen first and zoom in afterwards; don't zoom constantly or scroll at random, keep progress visible, and check nothing is pixelated.", evidence: from("Hay demasiado zoom todo el rato en el chat, no deja observar el progreso y hay mucho scroll random. ¿Y no está como pixelado?"), formats: ["making-of"] },
];

export type TasteQuery = { format?: string | undefined; categories?: readonly TasteCategory[] | undefined };

/** The house lessons for a video: every general lesson plus the format's own. */
export const houseTaste = (query: TasteQuery = {}): TasteLesson[] =>
  HOUSE_TASTE.filter((lesson) =>
    (!lesson.formats || !query.format || lesson.formats.includes(query.format)) &&
    (!query.categories?.length || query.categories.includes(lesson.category)));

/** A person's own lesson, as the Attelier API returns it. */
export type PersonTasteLesson = { id: string; category: string; statement: string; evidence?: string; format?: string; projectId?: string };

const CATEGORY_TITLES: Record<TasteCategory, string> = {
  subject: "Subject", structure: "Structure", pacing: "Pacing", music: "Music", sound: "Sound", voice: "Voice", captions: "Captions",
  typography: "Typography", copy: "Words", motion: "Motion", color: "Colour", branding: "Brand", review: "Before delivering",
};

/**
 * The guide an agent reads: the person's lessons first (they win a conflict),
 * then the house lessons by category. Rules are marked; defaults are open to
 * an explicit brief.
 */
export const tasteGuide = (house: readonly TasteLesson[], person: readonly PersonTasteLesson[] = []): string => {
  const lines = ["# Attelier taste", "", "Apply these while planning and check them before delivering. The person's own lessons come first and win any conflict. **Rule** = keep unless the person asks otherwise; the rest are defaults a brief may change."];
  if (person.length) {
    lines.push("", "## This person's taste");
    // Ids let record_preference refine a lesson instead of adding a near-duplicate.
    for (const lesson of person) lines.push(`- **Rule** ${lesson.statement} _(${lesson.format ? `for ${lesson.format}, ` : ""}id ${lesson.id})_`);
  }
  for (const category of TASTE_CATEGORIES) {
    const group = house.filter((lesson) => lesson.category === category);
    if (!group.length) continue;
    lines.push("", `## ${CATEGORY_TITLES[category]}`);
    for (const lesson of group) lines.push(`- ${lesson.strength === "rule" ? "**Rule** " : ""}${lesson.statement}`);
  }
  lines.push("", "When the person corrects something about how the video looks, sounds or reads, call `record_preference` with the lesson in one imperative sentence and their words as evidence, so the next video starts from it; to sharpen one of their lessons above, pass its id as `replaces`.");
  return lines.join("\n");
};
