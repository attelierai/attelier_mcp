/**
 * Distilled playbooks: one runtime-shaped summary of each use-case SKILL.md,
 * expressed in terms of the live agent tools. The use-case registry attaches
 * each playbook to its skill. Structured TS data — no fs, bundles anywhere.
 */

export type Playbook = {
  id: string;
  title: string;
  /** One line for the catalog fallback so the model knows the skill exists. */
  summary: string;
  triggers: RegExp;
  /** Bilingual keywords scored individually — refine the trigger match. */
  keywords: string[];
  steps: string[];
};

export const ATTELIER_PLAYBOOKS: readonly Playbook[] = [
  {
    id: "content-pipeline", title: "Build a reusable content pipeline",
    summary: "save a versioned recipe, test inputs, inspect sources and independent videos, then configure bounded automation",
    triggers: /\b(pipelines?|receta reutilizable|plantilla recurrente|reusable recipe|programar.*v[ií]deo|automatizar.*contenido)\b/i,
    keywords: ["pipeline", "pipelines", "receta", "reutilizable", "programar", "schedule", "recurrente"],
    steps: [
      "Agree fixed design, duration, voice and resources versus variable slots; edit an owned template with ordinary Studio tools.",
      "Use create_pipeline or get_pipeline, then update_pipeline with expectedRevision to save typed inputs, dated sources, content templates, resources, slot bindings and the six connected stages. Never claim a save before the API succeeds.",
      "version_pipeline freezes the exact template revision. Use quote_job workflow content_pipeline, start_job and get_job with mode economic or faithful to test, or production to execute the active version; display effective substitutions, resolution and cost.",
      "Inspect saved source dates, overflow/voice issues and the rendered MP4. Correct the draft and create a new version; never edit past results or silently advance an active schedule.",
      "Trial source snapshots stay frozen for matching inputs and source definitions until refreshSources=true. Use pin_pipeline with expectedRevision,versionId,runId after a successful current-draft trial; production settings are pinned even after an economic test. Compatible scripts and resources are reused by dependency fingerprints.",
      "Only configure automation at the creator's request, with an active version, timezone, weekdays and positive per-execution/period limits. No social publication or arbitrary code.",
    ],
  },
  {
    id: "music-direction",
    title: "Choose and mix music",
    summary: "define the soundtrack role, search rights-cleared Library music first, generate only as fallback, then cut and duck intentionally",
    triggers: /\b(music|soundtrack|song|score|track|genre|bpm|m[uú]sica|banda sonora|canci[oó]n|pista|g[eé]nero)\b/i,
    keywords: ["music", "soundtrack", "song", "score", "track", "genre", "bpm", "música", "canción", "pista", "género"],
    steps: [
      "Decide the soundtrack's narrative function, genre, mood, energy arc, instrumentation and whether vocals would compete with dialogue; record that choice in the plan before editing.",
      "Call search_music_library before generate_music. For ads and monetized work keep commercial=true; choose only a candidate whose exact licence and duration fit the delivery.",
      "Read the candidates, preview evidence-based windows with suggest_music_moments, then place one exact cleared asset with place_music_excerpt and retain its provenance. If no cleared match exists, generate an original track or ask for a licensed user upload.",
      "Treat a named commercial recording as a creative reference until the exact master has a verified publishable rights record. Never download it from a video platform or assume a short excerpt is automatically permitted.",
      "A named commercial song is a reference until a valid project-specific licence or user-supplied rights record exists. Never fetch or place it merely because the output is described as noncommercial.",
      "Place music on its own role-tagged bus. Use the detected BPM/beat map for motivated cuts and keep automatic dialogue ducking, short fades and delivery loudness enabled.",
    ],
  },
  {
    id: "media-sourcing",
    title: "Source existing media",
    summary: "project and Library first, then licensed stock or approved web/dataset media, generation last",
    triggers: /\b(library|media library|stock|b.?roll|dataset|internet|web image|existing media|biblioteca|archivo|recurso|metraje)\b/i,
    keywords: ["library", "stock", "b-roll", "broll", "dataset", "internet", "web", "existing", "biblioteca", "archivo", "metraje", "recurso"],
    steps: [
      "Reuse supplied and project media first; preserve the exact selected asset identity and version.",
      "Search the user Library before external sources. Import only the chosen version with provenance and simulate before commit.",
      "For generic b-roll use search_stock then place_stock; record provider, source URL and license.",
      "Use use_web_image only for a source-proven brand asset with known rights. A reachable URL alone is not publishable permission.",
      "Use only declared approved datasets; never sealed benchmark or participant data. Generate only when valid existing media cannot satisfy the shot.",
    ],
  },
  {
    id: "product-ad",
    title: "Product ad from a brief",
    summary: "commercial direction from the brief, supplied material and approved brand choices",
    triggers: /\b(ad|advert|advertis|commercial|promo|campaign|launch|spot|anuncio|comercial|publicidad)\b/i,
    keywords: ["ad", "ads", "advert", "commercial", "promo", "spot", "campaign", "launch", "anuncio", "comercial", "publicidad", "campaña", "producto", "product", "brand", "marca", "cta"],
    steps: [
      "Capture the brief with set_brief (audience/channel/tone/CTA) and the product with remember_ingredient. Never invent a price, claim or offer.",
      "Choose editable beats for the message and material; hook/benefit/proof/CTA is an option, not a required order. Keep approved structure on a targeted correction.",
      "Reuse supplied media first; stock for realistic generic b-roll; generate only the beats that are brand-specific, keeping the product identity exact.",
      "Before placement, inspect decoded dimensions and relative size. Use cover only when the crop preserves the product/message; use contain for the complete logo. Judge black space and shot duration against the intended composition and rhythm, not a universal threshold.",
      "Author only requested copy as editable TEXT layers. Use edit_title for existing text. Size titles and captions for their different roles, frame and reference; preserve accepted typography.",
      "Choose the soundtrack in the plan, then search_music_library before generate_music. Keep music, voiceover and SFX as separate role-tagged elements; voiceover/dialogue plus music automatically enables Attelier's sidechain ducking, so never split or manually attenuate the music unless the user explicitly asks for a custom envelope.",
      "Use transitions, motion and polish only when they serve the agreed direction. Export and inspect decoded frames at relevant moments, retaining intentional stillness or black cards. Verify speech only when present; separate listening from transcript and meter evidence.",
    ],
  },
  {
    id: "talking-head",
    title: "Polish a talking head",
    summary: "transcribe, clean fillers/silences, captions, platform reframe, ducked mix",
    triggers: /\b(talking.?head|presenter|interview|testimonial|podcast|explainer|to.?camera|a c[aá]mara|entrevista|locutor|presentador)\b/i,
    keywords: ["talking head", "presenter", "interview", "testimonial", "podcast", "explainer", "entrevista", "locutor", "presentador", "speaker", "muletillas", "fillers", "silencios"],
    steps: [
      "Transcribe first (captions and cleanup both need the transcript).",
      "clean_audio to remove dead air and fillers — protect meaning, breath and intentional pauses; never fabricate words.",
      "Add captions from the approved transcript: short lines, readable timing, inside the safe area.",
      "Reframe per platform with reframe_subject keeping eyes/gestures/demos in frame — never a blind centre crop.",
      "Assign dialogue/voiceover and music roles for automatic sidechain ducking; use set_audio_levels only for an explicit custom level or envelope, then master to delivery loudness.",
      "Match source colour before any look; finish with polish_quality.",
    ],
  },
  {
    id: "long-to-shorts",
    title: "Long video to shorts",
    summary: "segment by ideas, truthful hooks, 9:16 subject reframe, captions per clip",
    triggers: /\b(shorts?|highlights?|cutdown|cut.?down|reels?|tiktoks?|momentos|destacados|clips? from|into clips?)\b/i,
    keywords: ["shorts", "short", "highlights", "cutdown", "reels", "reel", "tiktok", "momentos", "destacados", "clips", "viral", "repurpose"],
    steps: [
      "Transcribe and segment by complete ideas, not isolated viral phrases.",
      "Pick the highest-value moment and build a truthful hook without removing the context that changes the speaker's meaning.",
      "set_format to 9:16 and reframe_subject to keep the speaker in frame per platform.",
      "Tighten pacing with cuts before any retime; add approved captions.",
      "Role-aware audio mix automatically ducks music under speech; matched colour, then polish_quality per clip.",
    ],
  },
  {
    id: "localization",
    title: "Localize and dub",
    summary: "captions per locale, dub with locked glossary, consent-gated lip-sync",
    triggers: /\b(localiz|localis|dub|dubbing|subtitle|subtitles|translate|translation|multilingual|locale|dobla|doblaje|subt[ií]tulos|traduc)\b/i,
    keywords: ["localize", "localise", "dub", "dubbing", "subtitle", "subtitles", "translate", "translation", "multilingual", "dobla", "doblaje", "subtítulos", "traduce", "idioma", "language"],
    steps: [
      "Transcribe, then add captions/subtitles first — adapt line breaks, reading speed and safe areas per locale.",
      "dub to translate the spoken audio; lock glossary terms, names and numbers — never change a claim.",
      "Preserve speaker mapping; fit speech to timing (≤1.18× compression) before retiming picture; never truncate or overlap dialogue.",
      "Use lip_sync ONLY after explicit consent for that identity.",
      "Role-aware mix; keep each locale as its own version; finish with a quality pass.",
    ],
  },
  {
    id: "create-from-brief",
    title: "Create a full video from a brief",
    summary: "cheap-first build: brief + ingredients → hero → shots → titles → VO/music → repair pass",
    triggers: /\b(create|make|build|genera|crea|haz|monta)\b.{0,40}\b(video|v[ií]deo|ad|reel|short|clip|film|spot)\b/i,
    keywords: ["create", "make", "build", "genera", "crea", "haz", "monta", "video", "vídeo", "film", "brief", "desde cero", "from scratch"],
    steps: [
      "Capture the brief (set_brief) and any recurring characters/products/locations/styles (remember_ingredient) BEFORE producing.",
      "Define ONE visualStyle phrase (palette, light, lens) and prefix it to every generation prompt so the shots cut as one film.",
      "Reuse valid material first; source only missing footage and choose titles, voice, music or silence according to the brief. Search rights-cleared Library music before generation and approve narrative and tempo before expensive video generation.",
      "Route each generation by the task (native-audio scene, cinematic motion, localized edit), not by a favourite model.",
      "Keep audio on separate buses (voiceover/music/SFX) so ducking, loudness and late fixes stay in your control.",
      "Review the requested result; repair evidenced defects within scope and export the exact revision. Add captions, reframing or polish only when requested or needed for the agreed direction.",
    ],
  },
  {
    id: "story-from-idea",
    title: "Turn one idea into a finished short film",
    summary: "choose story, visuals and sound from the brief; reuse each valid stage when revising",
    triggers: /\b(story|short film|cortometraje|historia|narrative|from an? idea|desde una idea|logline)\b/i,
    keywords: ["story", "historia", "short film", "cortometraje", "idea", "logline", "narrative", "guion", "guión", "storyboard", "beats"],
    steps: [
      "Choose a visual story, dialogue or narrated story from the brief. If narration is requested, size the spoken script to duration at roughly 2.5 words per second.",
      "Split the script into beats; give every beat one shot description plus one shared look sentence so the film does not drift.",
      "Reuse existing visual material for each beat. Generate or animate only when missing material and the requested direction require it within authorized scope.",
      "Only generate missing, authorized assets. Narration is optional; reuse accepted music and voice. If a spoken line changes, replace that line alone.",
      "Assemble the agreed beats, mix according to their audio roles, then review the rendered result before delivery.",
      "Re-run a single stage rather than the film when the creator changes their mind.",
    ],
  },
  {
    id: "faceless-explainer",
    title: "Narrated explainer with no presenter",
    summary: "narration-led explainer over generated images, motion and on-screen text",
    triggers: /\b(explainer|faceless|how it works|c[oó]mo funciona|explicativo|tutorial|voice.?over video)\b/i,
    keywords: ["explainer", "faceless", "explicativo", "tutorial", "how it works", "cómo funciona", "narration", "narración", "voiceover"],
    steps: [
      "Agree the spine first: one claim per section, ordered the way a newcomer needs them.",
      "If narration is part of the agreed explainer, write it per section so a rewrite costs one line; an explicit music-only or text-led request takes precedence.",
      "Illustrate each section with suitable existing material; generate only missing authorized images, and use motion when it helps the explanation.",
      "Keep one visual system for the whole video and one readable text overlay per claim.",
      "Never make the viewer read and listen to different sentences at once.",
      "Review the cut and keep every on-screen number traceable to the creator's source.",
    ],
  },
  {
    id: "social-repurposing",
    title: "Repurpose for social platforms",
    summary: "derive platform-specific versions from one approved master while preserving meaning, identity and provenance",
    triggers: /\b(repurpose|repurposing|cross.?platform|multi.?platform|social versions?|variantes? sociales?|reutiliza|adaptar? a (?:tiktok|reels?|shorts?|instagram|youtube))\b/i,
    keywords: ["repurpose", "cross-platform", "social", "versions", "variantes", "reutiliza", "tiktok", "reels", "shorts"],
    steps: [
      "Treat the approved source or master as authority; keep claims, speaker meaning and asset provenance unchanged.",
      "Define one delivery contract per platform: aspect, duration, safe areas, caption density and CTA placement.",
      "Duplicate the editorial branch, select complete ideas, then tighten with trim/split/ripple tools before changing playback speed.",
      "Use reframe_subject per shot, not one blind crop for the whole sequence; rebuild titles and captions inside each safe area.",
      "Evaluate and export every variant independently so a good master cannot hide a broken vertical or short version.",
    ],
  },
  {
    id: "pure-editing",
    title: "Edit supplied media only",
    summary: "assemble and finish only creator-supplied or already-approved Library media with no generation",
    triggers: /\b(supplied media only|existing (?:clips?|footage|media) only|no (?:ai|generation|generative)|solo (?:material|clips?|metraje) (?:dado|existente|aportado)|sin (?:ia|generar|generaci[oó]n))\b/i,
    keywords: ["supplied", "existing", "no ai", "no generation", "solo material", "sin ia", "metraje existente"],
    steps: [
      "Lock the source boundary: use project and approved Library assets only; do not call generation or external sourcing tools.",
      "Inspect source ranges and transcripts, then build the cut with reversible trim, ripple, roll, slip, slide and multicam operations.",
      "Use only editorially motivated transitions, motion and titles; never invent missing visual evidence.",
      "Clean and mix the supplied audio, match source colour and add captions only from approved transcript evidence.",
      "Critique, repair measured defects and export with exact source-to-output lineage.",
    ],
  },
  {
    id: "assemble-from-clips",
    title: "Assemble a cut from supplied clips",
    summary: "turn a folder or Library of raw clips into a reviewable first cut: transcribe, describe, set the timebase from the sources, order by story and place with source ranges",
    triggers: /\b(assemble|first cut|rough cut|string ?out|cut (?:these|the|my) (?:clips?|footage|rushes)|edit (?:these|the|my) (?:clips?|rushes)|documentary|launch film|monta(?:je|r) (?:estos|los) clips|primer montaje)\b/i,
    keywords: ["assemble", "first cut", "rough cut", "rushes", "clips", "documentary", "launch film", "montaje", "primer corte"],
    steps: [
      "Capture or read the brief before any styling decision; ask for a reference instead of inventing a look.",
      "Inspect the project, then read each clip with get_transcript, get_asset_description/describe_asset and get_audio_analysis.",
      "Set the sequence frame rate from the modal source frame rate before placing anything.",
      "Write the story order, then place each shot with explicit source ranges on word boundaries and 120 ms handles.",
      "Level dialogue onto one bed, add identification titles, checkpoint with named versions, then review_cut and render_frame before quoting a render.",
    ],
  },
  {
    id: "assemble-from-brief",
    title: "Assemble a cut from a stored brief",
    summary: "map every brief line to transcript-backed source timecodes, place it in script order, identify characters and close story gaps before export",
    triggers: /\b(assemble|edit|cut|monta|montaje)\b.{0,50}\b(from (?:the )?brief|brief|guion|gui[oó]n)\b/i,
    keywords: ["assemble from brief", "stored brief", "script coverage", "story coverage", "montaje", "guion", "guión"],
    steps: [
      "Store and read the approved structured brief before editing, then inspect project coverage after all dialogue clips have transcripts.",
      "Write a script-order table from the 0.75 fuzzy matches, preserving source timecodes and marking unshot versus shot-but-unplaced lines separately.",
      "Prepare revision-pinned placements and trim them to speech; use speech-fitted transitions and one brief-approved lower third on each character's first clear shot.",
      "Run story review until no beat is missing or out of order, then run cut review, delivery gates and the quoted export flow.",
    ],
  },
  {
    id: "restoration",
    title: "Restore damaged footage",
    summary: "measure defects, stabilize and clean conservatively, protect identity, and preserve an untouched source",
    triggers: /\b(restor|repair (?:old|damaged) (?:video|footage)|old footage|damaged footage|denoise|stabili[sz]|scratch|flicker|privacy blur|restaura|repara (?:v[ií]deo|metraje)|ruido|estabiliza|desenfoca (?:cara|matr[ií]cula))\b/i,
    keywords: ["restore", "restoration", "damaged", "denoise", "stabilize", "scratch", "restaura", "repara", "ruido", "estabiliza"],
    steps: [
      "Preserve the original asset and inspect measurable defects before proposing treatment.",
      "Apply the least destructive local repair first: clean_audio for noise, apply_motion_treatment for stabilization, and conservative colour correction.",
      "Use apply_region_blur only for an explicit privacy target; track the mask and verify every visible interval.",
      "Use image-only upscale_clip, or an available quoted Vidaio whole-video upscale/compression inference route, only after evidence justifies it; never hallucinate historical detail.",
      "Compare repaired output against the untouched source and record residual defects before delivery.",
    ],
  },
  {
    id: "generative-vfx",
    title: "Create a generative VFX shot",
    summary: "design a bounded shot transformation with references, masks, continuity and a reversible fallback",
    triggers: /\b(vfx|visual effects?|inpaint|remove (?:an )?object|replace background|generative fill|image.?to.?video|animate (?:this|the) image|efectos? visuales?|relleno generativo|elimina (?:un )?objeto|reemplaza (?:el )?fondo|anima (?:esta|la) imagen)\b/i,
    keywords: ["vfx", "inpaint", "remove object", "replace background", "generative", "image to video", "efectos visuales", "relleno generativo"],
    steps: [
      "Define the exact shot, protected subjects, source frame window and success/failure boundary before generation.",
      "Reuse approved ingredients and visualStyle; isolate only the intended region or subject and preserve identity-critical detail.",
      "Choose the narrowest capability: remove_background, generate_background, animate_clip or a quoted video generation route.",
      "Keep the original layer and generated result as separate reversible assets with prompt, model, seed and source lineage.",
      "Check entrance/exit continuity, edge artifacts, temporal stability and compositing against adjacent shots before placement.",
    ],
  },
  {
    id: "authorized-avatar",
    title: "Create an authorized talking avatar",
    summary: "consent-gated identity media with approved script, voice, lip-sync and delivery revalidation",
    triggers: /\b(talking avatar|digital human|avatar video|lip.?sync|voice clone|cloned voice|avatar parlante|humano digital|sincroniza (?:los )?labios|clona (?:la )?voz)\b/i,
    keywords: ["avatar", "talking avatar", "digital human", "lip sync", "voice clone", "avatar parlante", "labios", "clona voz"],
    steps: [
      "Stop until active consent covers the exact identity, face/voice modalities, purpose and intended delivery.",
      "Lock the creator-approved script and speaker mapping; never synthesize an unapproved claim or impersonation.",
      "Generate or place the authorized voice, then use lip_sync only with the verified consent record and exact source identity.",
      "Keep narration, music and effects on separate buses; inspect mouth timing, facial artifacts and voice intelligibility.",
      "Revalidate consent and publishability at export; a technically successful render is not delivery authorization.",
    ],
  },
];
