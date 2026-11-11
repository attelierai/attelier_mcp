import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ATTELIER_SKILLS, type AttelierSkill } from "./skill-registry.js";

/** Default skills root: the package's bundled `skills/` directory, resolved
 * from this package rather than from the caller's working directory. The kit
 * is the only reader of SKILL.md; UI, API and MCP go through `loadSkill`. */
export const DEFAULT_ATTE_SKILLS_ROOT = fileURLToPath(new URL("../skills/", import.meta.url));

export type AtteSkillLoaderOptions = {
  /** Absolute path to the directory holding `<skill-id>/SKILL.md`. */
  skillsRoot?: string;
};

export type AtteSkillManifest = Pick<AttelierSkill, "id" | "version" | "kind" | "audience" | "effects">;

export type AtteLoadedSkill = AttelierSkill & { content: string };

/** Manifests only. Loading a body is a separate, explicit step. */
export const listSkills = (): AtteSkillManifest[] =>
  ATTELIER_SKILLS
    .filter(({ audience }) => audience === "agent")
    .map(({ id, version, kind, audience, effects }) => ({ id, version, kind, audience, effects }));

const skillsRootOf = (options: AtteSkillLoaderOptions | undefined): string =>
  options?.skillsRoot?.trim() || DEFAULT_ATTE_SKILLS_ROOT;

/** Read one registered skill. Returns undefined for an unregistered id; the
 * registry — never the filesystem listing — decides what exists. */
export const loadSkill = (
  id: string,
  options: AtteSkillLoaderOptions = {},
): AtteLoadedSkill | undefined => {
  const manifest = ATTELIER_SKILLS.find((skill) => skill.id === id && skill.audience === "agent");
  if (!manifest) return undefined;
  // `manifest.path` is a repository-relative "skills/<id>/SKILL.md".
  const relative = manifest.path.replace(/^skills\//, "");
  const root = skillsRootOf(options).replace(/\/*$/, "/");
  return { ...manifest, content: readFileSync(new URL(relative, `file://${root}`), "utf8") };
};

/** Registry/content consistency check used by the API contract tests. */
export const validateSkills = (options: AtteSkillLoaderOptions = {}): string[] => {
  const issues: string[] = [];
  for (const manifest of ATTELIER_SKILLS) {
    let skill: AtteLoadedSkill | undefined;
    try {
      const relative = manifest.path.replace(/^skills\//, "");
      const root = skillsRootOf(options).replace(/\/*$/, "/");
      skill = { ...manifest, content: readFileSync(new URL(relative, `file://${root}`), "utf8") };
    } catch {
      skill = undefined;
    }
    if (!skill) {
      issues.push(`${manifest.id} cannot be loaded`);
      continue;
    }
    if (!skill.content.startsWith(`---\nname: ${manifest.id}\n`)) {
      issues.push(`${manifest.id} frontmatter does not match its manifest`);
    }
    if (/\bTODO\b/.test(skill.content)) issues.push(`${manifest.id} contains an unresolved TODO`);
    for (const effect of manifest.effects) {
      if (!skill.content.includes(`${effect.id}@${effect.version}`)) {
        issues.push(`${manifest.id} does not reference pinned effect ${effect.id}@${effect.version}`);
      }
    }
  }
  return issues;
};
