import type { Project } from "@attelier/project-schema";
import type { LlmToolCall } from "./editor-tool-surface.js";

export type PostconditionRepair = LlmToolCall & {
  owner: "harness-postcondition-verifier";
  postcondition: "canvas.aspect";
};

type ExplicitAspect = {
  aspect: "9:16" | "16:9" | "1:1";
  width: number;
  height: number;
};

const explicitAspect = (instruction: string): ExplicitAspect | undefined => {
  const normalized = instruction.toLowerCase();
  if (/\b9\s*:\s*16\b/.test(normalized))
    return { aspect: "9:16", width: 1080, height: 1920 };
  if (/\b16\s*:\s*9\b/.test(normalized))
    return { aspect: "16:9", width: 1920, height: 1080 };
  if (/\b1\s*:\s*1\b/.test(normalized))
    return { aspect: "1:1", width: 1080, height: 1080 };
  return undefined;
};

/**
 * Fail-closed deterministic repairs for postconditions that are both explicit
 * in the user's instruction and mechanically observable in the live project.
 * It deliberately does not infer creative intent or repair subjective quality.
 */
export const verifyExplicitPostconditions = (
  project: Project,
  instruction: string,
): PostconditionRepair[] => {
  const expected = explicitAspect(instruction);
  if (!expected) return [];
  const sequence =
    project.sequences.find(({ id }) => id === project.activeSequenceId) ??
    project.sequences[0];
  if (
    sequence?.canvas.width === expected.width &&
    sequence.canvas.height === expected.height
  )
    return [];
  return [
    {
      name: "set_format",
      arguments: { aspect: expected.aspect },
      owner: "harness-postcondition-verifier",
      postcondition: "canvas.aspect",
    },
  ];
};
