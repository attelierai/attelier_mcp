import type { WorkflowKind } from "@attelier/workflow-schema";
import type { AttelierFeatureFamily } from "@atte/kit/feature-registry";
import { ATTELIER_FEATURE_FAMILIES } from "@atte/kit/feature-registry";
import { ATTELIER_PLAYBOOKS, type Playbook } from "@atte/kit/skill-retrieval";
import { ATTELIER_SKILLS, type AttelierSkill } from "./skill-registry.js";

export const ATTELIER_USE_CASE_REGISTRY_VERSION = "atelier.use-cases.v1" as const;

type UseCaseSkill = Extract<AttelierSkill, { kind: "use-case"; audience: "agent" }>;
export type AttelierUseCaseId = UseCaseSkill["id"];

export type AttelierUseCase = {
  id: AttelierUseCaseId;
  skillVersion: string;
  playbook: Playbook;
  featureFamilies: readonly AttelierFeatureFamily[];
  workflowKind?: WorkflowKind;
};

const FEATURE_FAMILIES_BY_USE_CASE = {
  "content-pipeline": ["creative-control", "library", "edit", "text", "audio", "media-ai", "delivery"],
  "product-ad": ["creative-control", "library", "edit", "composition", "motion", "text", "audio", "color-vfx", "media-ai", "delivery"],
  "talking-head": ["edit", "timeline", "composition", "text", "audio", "color-vfx", "delivery"],
  "long-to-shorts": ["edit", "timeline", "composition", "text", "audio", "delivery"],
  localization: ["edit", "text", "audio", "delivery"],
  "create-from-brief": ["creative-control", "library", "media-ai", "composition", "motion", "text", "audio", "delivery"],
  "social-repurposing": ["edit", "timeline", "composition", "text", "audio", "delivery"],
  "pure-editing": ["library", "edit", "timeline", "composition", "motion", "text", "audio", "color-vfx", "delivery"],
  "assemble-from-clips": ["library", "edit", "timeline", "composition", "text", "audio", "color-vfx", "delivery"],
  "assemble-from-brief": ["creative-control", "library", "edit", "timeline", "composition", "text", "audio", "delivery"],
  restoration: ["edit", "motion", "audio", "color-vfx", "media-ai", "delivery"],
  "generative-vfx": ["library", "media-ai", "color-vfx", "motion", "composition", "delivery"],
  "authorized-avatar": ["creative-control", "media-ai", "audio", "text", "delivery"],
  "story-from-idea": ["creative-control", "library", "media-ai", "composition", "motion", "text", "audio", "delivery"],
  "faceless-explainer": ["creative-control", "library", "media-ai", "motion", "text", "audio", "delivery"],
} as const satisfies Record<AttelierUseCaseId, readonly AttelierFeatureFamily[]>;

const WORKFLOW_BY_USE_CASE: Partial<Record<AttelierUseCaseId, WorkflowKind>> = {
  "content-pipeline": "content_pipeline",
  "product-ad": "product_ad",
  "talking-head": "talking_head_enhancer",
  "long-to-shorts": "long_form_to_shorts",
  "social-repurposing": "social_repurposing",
  restoration: "restoration",
  "generative-vfx": "generative_vfx",
  localization: "localization",
  "create-from-brief": "create_from_brief",
  "authorized-avatar": "talking_avatar",
};

const featureFamilies = new Set<AttelierFeatureFamily>(ATTELIER_FEATURE_FAMILIES);

export const ATTELIER_USE_CASES: readonly AttelierUseCase[] = Object.freeze(
  ATTELIER_SKILLS
    .filter((skill): skill is UseCaseSkill => skill.kind === "use-case" && skill.audience === "agent")
    .map((skill) => {
      const playbook = ATTELIER_PLAYBOOKS.find(({ id }) => id === skill.id);
      if (!playbook) throw new Error(`Attelier use case ${skill.id} has no live playbook.`);
      const families = FEATURE_FAMILIES_BY_USE_CASE[skill.id];
      for (const family of families) {
        if (!featureFamilies.has(family)) throw new Error(`Attelier use case ${skill.id} references unknown feature family ${family}.`);
      }
      const workflowKind = WORKFLOW_BY_USE_CASE[skill.id];
      return {
        id: skill.id,
        skillVersion: skill.version,
        playbook,
        featureFamilies: families,
        ...(workflowKind ? { workflowKind } : {}),
      };
    }),
);

export const attelierUseCase = (id: AttelierUseCaseId): AttelierUseCase => {
  const useCase = ATTELIER_USE_CASES.find((candidate) => candidate.id === id);
  if (!useCase) throw new Error(`Unknown Attelier use case ${id}.`);
  return useCase;
};
