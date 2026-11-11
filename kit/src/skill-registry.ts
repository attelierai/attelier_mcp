import {
  effectRef,
  type EffectId,
} from "@attelier/capability-schema/effect-catalog";

export const ATTELIER_SKILL_REGISTRY_VERSION = "1.49.0";

const skillEffects = (...ids: EffectId[]) => ids.map(effectRef);

const AGENT_SKILLS = [
  { id: "content-pipeline", version: "1.0.0", kind: "use-case", path: "skills/content-pipeline/SKILL.md", effects: skillEffects() },
  { id: "video-craft", version: "1.4.0", kind: "foundation", path: "skills/video-craft/SKILL.md", effects: skillEffects() },
  { id: "media-sourcing", version: "1.0.0", kind: "discipline", path: "skills/media-sourcing/SKILL.md", effects: skillEffects() },
  { id: "product-ad", version: "1.18.1", kind: "use-case", path: "skills/product-ad/SKILL.md", effects: skillEffects("atelier.color.match-and-look") },
  { id: "talking-head", version: "1.2.0", kind: "use-case", path: "skills/talking-head/SKILL.md", effects: skillEffects() },
  { id: "long-to-shorts", version: "1.2.0", kind: "use-case", path: "skills/long-to-shorts/SKILL.md", effects: skillEffects() },
  { id: "localization", version: "1.3.0", kind: "use-case", path: "skills/localization/SKILL.md", effects: skillEffects() },
  { id: "localize-video", version: "1.0.0", kind: "discipline", path: "skills/localize-video/SKILL.md", effects: skillEffects("atelier.audio.professional-mix") },
  { id: "create-from-brief", version: "1.0.0", kind: "use-case", path: "skills/create-from-brief/SKILL.md", effects: skillEffects() },
  { id: "social-repurposing", version: "1.1.0", kind: "use-case", path: "skills/social-repurposing/SKILL.md", effects: skillEffects() },
  { id: "pure-editing", version: "1.0.0", kind: "use-case", path: "skills/pure-editing/SKILL.md", effects: skillEffects() },
  { id: "assemble-from-clips", version: "1.0.0", kind: "use-case", path: "skills/assemble-from-clips/SKILL.md", effects: skillEffects() },
  { id: "assemble-from-brief", version: "1.1.0", kind: "use-case", path: "skills/assemble-from-brief/SKILL.md", effects: skillEffects() },
  { id: "restoration", version: "1.2.0", kind: "use-case", path: "skills/restoration/SKILL.md", effects: skillEffects("atelier.region.blur") },
  {
    id: "generative-vfx",
    version: "1.1.0",
    kind: "use-case",
    path: "skills/generative-vfx/SKILL.md",
    effects: skillEffects("atelier.composite.subject-cutout", "atelier.region.inpaint", "atelier.generate.image-to-video"),
  },
  {
    id: "generate-coverage",
    version: "1.0.0",
    kind: "discipline",
    path: "skills/generate-coverage/SKILL.md",
    effects: skillEffects("atelier.generate.image-to-video"),
  },
  {
    id: "authorized-avatar",
    version: "1.1.0",
    kind: "use-case",
    path: "skills/authorized-avatar/SKILL.md",
    effects: skillEffects("atelier.identity.lip-sync", "atelier.audio.professional-mix"),
  },
  { id: "edit-cutting", version: "1.3.0", kind: "discipline", path: "skills/edit-cutting/SKILL.md", effects: skillEffects("atelier.retime.speed") },
  {
    id: "motion-design",
    version: "1.8.0",
    kind: "discipline",
    path: "skills/motion-design/SKILL.md",
    effects: skillEffects("atelier.motion.ken-burns", "atelier.motion.stabilization", "atelier.motion.motion-blur"),
  },
  { id: "attelier-outro", version: "1.0.0", kind: "discipline", path: "skills/attelier-outro/SKILL.md", effects: skillEffects() },
  { id: "typography", version: "1.1.0", kind: "discipline", path: "skills/typography/SKILL.md", effects: skillEffects("atelier.text.readable-overlay") },
  { id: "audio-mix", version: "1.2.0", kind: "discipline", path: "skills/audio-mix/SKILL.md", effects: skillEffects("atelier.audio.professional-mix") },
  { id: "color-finishing", version: "1.2.0", kind: "discipline", path: "skills/color-finishing/SKILL.md", effects: skillEffects("atelier.color.match-and-look") },
  {
    id: "transitions",
    version: "1.2.0",
    kind: "discipline",
    path: "skills/transitions/SKILL.md",
    effects: skillEffects("atelier.transition.cross-dissolve", "atelier.transition.dip-to-black", "atelier.transition.dip-to-white"),
  },
  { id: "project-brief", version: "1.0.0", kind: "discipline", path: "skills/project-brief/SKILL.md", effects: skillEffects() },
  { id: "review-cut", version: "1.0.0", kind: "discipline", path: "skills/review-cut/SKILL.md", effects: skillEffects() },
  { id: "fix-cut-boundaries", version: "1.0.0", kind: "discipline", path: "skills/fix-cut-boundaries/SKILL.md", effects: skillEffects() },
  { id: "dialogue-levelling", version: "1.0.0", kind: "discipline", path: "skills/dialogue-levelling/SKILL.md", effects: skillEffects() },
  { id: "lower-thirds", version: "1.0.0", kind: "discipline", path: "skills/lower-thirds/SKILL.md", effects: skillEffects() },
  { id: "brand-compliance", version: "1.0.0", kind: "discipline", path: "skills/brand-compliance/SKILL.md", effects: skillEffects() },
  { id: "delivery-qc", version: "1.1.0", kind: "discipline", path: "skills/delivery-qc/SKILL.md", effects: skillEffects() },
  { id: "model-selection", version: "1.0.0", kind: "discipline", path: "skills/model-selection/SKILL.md", effects: skillEffects() },
  { id: "prompting", version: "1.0.0", kind: "discipline", path: "skills/prompting/SKILL.md", effects: skillEffects() },
  { id: "story-from-idea", version: "1.0.0", kind: "use-case", path: "skills/story-from-idea/SKILL.md", effects: skillEffects() },
  { id: "faceless-explainer", version: "1.0.0", kind: "use-case", path: "skills/faceless-explainer/SKILL.md", effects: skillEffects() },
] as const;

export const ATTELIER_SKILLS = [
  ...AGENT_SKILLS.map((skill) => ({ ...skill, audience: "agent" as const })),
] as const;

export type AttelierSkill = typeof ATTELIER_SKILLS[number];
export type AttelierSkillId = AttelierSkill["id"];
