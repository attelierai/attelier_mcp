import { ATTELIER_SKILLS, type AttelierSkillId } from "./skill-registry.js";

/**
 * The product layer's skill catalog: what a creator picks in the UI, as
 * opposed to the agent-facing playbooks in `skill-registry`. Every product
 * skill names exactly one playbook, the inputs it needs from the creator, the
 * outputs it promises, the tool sequence it pins, and the capabilities a price
 * estimate has to cover. The API turns the last one into credits at each
 * quality tier; the registry never hardcodes a price.
 */
export const ATTE_PRODUCT_SKILL_CATALOG_VERSION = "1.0.0" as const;

export const ATTE_PRODUCT_SKILL_CATEGORIES = [
  "Story",
  "Ads",
  "Shorts",
  "Talking head",
  "Localize",
  "Explainer",
  "Edit",
] as const;
export type AtteProductSkillCategory = typeof ATTE_PRODUCT_SKILL_CATEGORIES[number];

/** What the creator has to bring. `required` is the product's own contract. */
export const ATTE_PRODUCT_SKILL_INPUT_KINDS = [
  "idea",
  "script",
  "product_url",
  "source_video",
  "source_images",
  "target_languages",
  "voice_sample",
  "duration",
  "aspect",
] as const;
export type AtteProductSkillInputKind = typeof ATTE_PRODUCT_SKILL_INPUT_KINDS[number];

export type AtteProductSkillInput = {
  kind: AtteProductSkillInputKind;
  label: string;
  required: boolean;
};

/** One priced ingredient of a run: a capability and how many units it takes. */
export type AtteProductSkillEstimateItem = {
  capability: string;
  /** Images, clips, spoken segments or tracks a typical run of this skill buys. */
  units: number;
};

export type AtteProductSkill = {
  id: string;
  title: string;
  description: string;
  category: AtteProductSkillCategory;
  featured: boolean;
  /** The authored playbook injected first when a turn pins this skill. */
  playbookSkillId: AttelierSkillId;
  inputs: readonly AtteProductSkillInput[];
  outputs: readonly string[];
  /** Pinned default tool order for a turn that selects this skill. */
  toolSequence: readonly string[];
  estimate: readonly AtteProductSkillEstimateItem[];
  examplePrompt: string;
};

const input = (kind: AtteProductSkillInputKind, label: string, required = true): AtteProductSkillInput =>
  ({ kind, label, required });

export const ATTE_PRODUCT_SKILLS: readonly AtteProductSkill[] = Object.freeze([
  {
    id: "story-from-idea",
    title: "Story from an idea",
    description: "One line becomes a finished short film: script, boards, motion, voice, music and a reviewed cut.",
    category: "Story",
    featured: true,
    playbookSkillId: "story-from-idea",
    inputs: [input("idea", "The idea or logline"), input("duration", "Length in seconds", false), input("aspect", "Aspect ratio", false)],
    outputs: ["Script", "Storyboard beats", "Animated clips", "Voiceover", "Music bed", "Assembled timeline"],
    toolSequence: ["inspect_project", "generate_image", "animate_clip", "generate_voiceover", "generate_music", "place_asset", "review_project"],
    estimate: [
      { capability: "text_to_image", units: 6 },
      { capability: "image_to_video", units: 6 },
      { capability: "voice_generation", units: 6 },
      { capability: "music_generation", units: 1 },
    ],
    examplePrompt: "A 30-second film about a workshop that opens before the town wakes up.",
  },
  {
    id: "product-ad",
    title: "Product ad",
    description: "A hook-benefit-proof-CTA ad built from your product page and shots, on brand and ready to run.",
    category: "Ads",
    featured: true,
    playbookSkillId: "product-ad",
    inputs: [input("product_url", "Product page URL", false), input("source_images", "Product shots", false), input("idea", "The offer and audience"), input("duration", "Length in seconds", false)],
    outputs: ["Ad script", "Product shots", "Voiceover", "Captions", "Assembled ad"],
    toolSequence: ["inspect_project", "generate_image", "generate_voiceover", "place_asset", "review_project"],
    estimate: [
      { capability: "text_to_image", units: 4 },
      { capability: "image_to_video", units: 2 },
      { capability: "voice_generation", units: 3 },
      { capability: "music_generation", units: 1 },
    ],
    examplePrompt: "A 15-second ad for our refillable coffee flask, aimed at commuters, ending on “Refill, don't rebuy”.",
  },
  {
    id: "long-to-shorts",
    title: "Long video to shorts",
    description: "Find the complete ideas inside a long recording and cut each one into its own vertical short.",
    category: "Shorts",
    featured: true,
    playbookSkillId: "long-to-shorts",
    inputs: [input("source_video", "The long recording"), input("aspect", "Target aspect", false)],
    outputs: ["Selected moments", "Vertical reframes", "Captions", "One timeline per short"],
    toolSequence: ["inspect_project", "place_asset", "review_project"],
    estimate: [],
    examplePrompt: "Pull three shorts out of this hour-long interview, vertical, with captions.",
  },
  {
    id: "talking-head",
    title: "Talking head",
    description: "Clean up a piece to camera: pacing, levels, captions and a readable lower third.",
    category: "Talking head",
    featured: true,
    playbookSkillId: "talking-head",
    inputs: [input("source_video", "The piece to camera"), input("script", "The intended script", false)],
    outputs: ["Tightened cut", "Levelled dialogue", "Captions", "Lower third"],
    toolSequence: ["inspect_project", "place_asset", "review_project"],
    estimate: [],
    examplePrompt: "Tighten this two-minute update, remove the dead air and add captions.",
  },
  {
    id: "localize-video",
    title: "Localize a video",
    description: "Take one approved cut into other languages with translated voice, captions and a checked mix.",
    category: "Localize",
    featured: true,
    playbookSkillId: "localize-video",
    inputs: [input("source_video", "The approved cut"), input("target_languages", "Target languages")],
    outputs: ["Translated script", "Localized voiceover", "Localized captions", "One timeline per language"],
    toolSequence: ["inspect_project", "generate_voiceover", "place_asset", "review_project"],
    estimate: [{ capability: "voice_generation", units: 8 }],
    examplePrompt: "Localize this product video into Spanish and German, keeping the original music bed.",
  },
  {
    id: "faceless-explainer",
    title: "Faceless explainer",
    description: "A narrated explainer with nobody on camera, over generated images, motion and on-screen text.",
    category: "Explainer",
    featured: true,
    playbookSkillId: "faceless-explainer",
    inputs: [input("idea", "What to explain"), input("script", "Your narration", false), input("duration", "Length in seconds", false)],
    outputs: ["Narration script", "Illustrations", "Motion", "Voiceover", "Text overlays", "Assembled timeline"],
    toolSequence: ["inspect_project", "generate_voiceover", "generate_image", "animate_clip", "place_asset", "review_project"],
    estimate: [
      { capability: "text_to_image", units: 5 },
      { capability: "image_to_video", units: 5 },
      { capability: "voice_generation", units: 5 },
      { capability: "music_generation", units: 1 },
    ],
    examplePrompt: "Explain how a render queue works, 60 seconds, flat vector look, no presenter.",
  },
  {
    id: "create-from-brief",
    title: "Video from a brief",
    description: "Build a full video from an agreed brief, cheap ingredients first and expensive generation last.",
    category: "Story",
    featured: false,
    playbookSkillId: "create-from-brief",
    inputs: [input("script", "The brief"), input("source_images", "Any ingredients you already have", false), input("duration", "Length in seconds", false)],
    outputs: ["Hero image", "Generated shots", "Titles", "Voiceover and music", "Assembled timeline"],
    toolSequence: ["inspect_project", "generate_image", "animate_clip", "generate_voiceover", "generate_music", "place_asset", "review_project"],
    estimate: [
      { capability: "text_to_image", units: 5 },
      { capability: "image_to_video", units: 4 },
      { capability: "voice_generation", units: 4 },
      { capability: "music_generation", units: 1 },
    ],
    examplePrompt: "Make the launch video from this brief: 45 seconds, warm and plain-spoken.",
  },
  {
    id: "social-repurposing",
    title: "Repurpose for social",
    description: "Derive platform-specific versions of one approved master without changing what it claims.",
    category: "Shorts",
    featured: false,
    playbookSkillId: "social-repurposing",
    inputs: [input("source_video", "The approved master"), input("aspect", "Target aspects", false)],
    outputs: ["Per-platform cuts", "Reframes", "Captions"],
    toolSequence: ["inspect_project", "place_asset", "review_project"],
    estimate: [],
    examplePrompt: "Give me vertical and square versions of this master for Reels and LinkedIn.",
  },
  {
    id: "assemble-from-clips",
    title: "Assemble from clips",
    description: "Turn a pile of footage into an ordered, watchable cut with a real beginning and end.",
    category: "Edit",
    featured: false,
    playbookSkillId: "assemble-from-clips",
    inputs: [input("source_video", "Your clips"), input("idea", "What the cut should say", false)],
    outputs: ["Selected takes", "Ordered timeline", "Transitions", "Reviewed cut"],
    toolSequence: ["inspect_project", "place_asset", "review_project"],
    estimate: [],
    examplePrompt: "Cut these twelve clips from the trip into a two-minute video.",
  },
  {
    id: "pure-editing",
    title: "Edit what I have",
    description: "Editing only, no generation: trims, order, transitions, text, colour and mix on your own footage.",
    category: "Edit",
    featured: false,
    playbookSkillId: "pure-editing",
    inputs: [input("source_video", "The footage"), input("idea", "What to change", false)],
    outputs: ["Revised timeline", "Reviewed cut"],
    toolSequence: ["inspect_project", "place_asset", "review_project"],
    estimate: [],
    examplePrompt: "Shorten this to 90 seconds and make the middle section move faster.",
  },
  {
    id: "restoration",
    title: "Restore footage",
    description: "Rescue shaky, noisy, soft or badly lit material before it goes into a cut.",
    category: "Edit",
    featured: false,
    playbookSkillId: "restoration",
    inputs: [input("source_video", "The damaged footage")],
    outputs: ["Stabilized clips", "Upscaled clips", "Cleaned audio"],
    toolSequence: ["inspect_project", "place_asset", "review_project"],
    estimate: [{ capability: "upscale", units: 3 }],
    examplePrompt: "Stabilize and clean up this handheld footage from the workshop.",
  },
  {
    id: "generative-vfx",
    title: "Generative VFX",
    description: "Replace a background, remove an object or extend a shot with generated pixels that match the plate.",
    category: "Edit",
    featured: false,
    playbookSkillId: "generative-vfx",
    inputs: [input("source_video", "The plate"), input("idea", "What to change")],
    outputs: ["Cutouts", "Inpainted regions", "Generated coverage"],
    toolSequence: ["inspect_project", "animate_clip", "place_asset", "review_project"],
    estimate: [
      { capability: "background_removal", units: 2 },
      { capability: "region_inpaint", units: 2 },
      { capability: "image_to_video", units: 2 },
    ],
    examplePrompt: "Remove the parked van behind the speaker in this shot.",
  },
  {
    id: "authorized-avatar",
    title: "Authorized avatar",
    description: "A consented presenter delivers your script with lip sync and a professional mix.",
    category: "Talking head",
    featured: false,
    playbookSkillId: "authorized-avatar",
    inputs: [input("script", "The script"), input("voice_sample", "Consented voice or presenter", false)],
    outputs: ["Voiceover", "Lip-synced presenter", "Assembled timeline"],
    toolSequence: ["inspect_project", "generate_voiceover", "place_asset", "review_project"],
    estimate: [
      { capability: "voice_generation", units: 4 },
      { capability: "lip_sync", units: 2 },
    ],
    examplePrompt: "Have our consented presenter read this 40-second announcement.",
  },
] as const satisfies readonly AtteProductSkill[]);

export const ATTE_FEATURED_PRODUCT_SKILL_IDS: readonly string[] = Object.freeze(
  ATTE_PRODUCT_SKILLS.filter(({ featured }) => featured).map(({ id }) => id),
);

export const atteProductSkill = (id: string): AtteProductSkill | undefined =>
  ATTE_PRODUCT_SKILLS.find((skill) => skill.id === id);

/** Registry/playbook consistency check used by the catalog tests. */
export const validateProductSkills = (): string[] => {
  const issues: string[] = [];
  const playbooks = new Set(ATTELIER_SKILLS.filter(({ audience }) => audience === "agent").map(({ id }) => id));
  const seen = new Set<string>();
  for (const skill of ATTE_PRODUCT_SKILLS) {
    if (seen.has(skill.id)) issues.push(`${skill.id} is registered twice`);
    seen.add(skill.id);
    if (!playbooks.has(skill.playbookSkillId)) issues.push(`${skill.id} names unknown playbook ${skill.playbookSkillId}`);
    if (skill.toolSequence.length === 0) issues.push(`${skill.id} pins no tool sequence`);
    if (skill.outputs.length === 0) issues.push(`${skill.id} promises no output`);
    if (!skill.examplePrompt.trim()) issues.push(`${skill.id} has no example prompt`);
  }
  for (const id of ["story-from-idea", "product-ad", "long-to-shorts", "talking-head", "localize-video", "faceless-explainer"]) {
    if (!ATTE_FEATURED_PRODUCT_SKILL_IDS.includes(id)) issues.push(`${id} must be featured`);
  }
  return issues;
};
