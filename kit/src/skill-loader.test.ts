import { ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { ATTELIER_SKILLS } from "./skill-registry.js";
import {
  listSkills,
  loadSkill,
  validateSkills,
} from "./skill-loader.js";

test("the kit lists exactly the registered skills", () => {
  strictEqual(listSkills().length, ATTELIER_SKILLS.filter(({ audience }) => audience === "agent").length);
  ok(listSkills().every(({ id, version }) => id && version));
});

test("the kit reads SKILL.md from the default repository skills root", () => {
  const skill = loadSkill("video-craft");
  ok(skill, "video-craft did not load");
  ok(skill.content.startsWith("---\nname: video-craft\n"));
});

test("an unregistered skill id is undefined, not a filesystem probe", () => {
  strictEqual(loadSkill("../../etc/passwd"), undefined);
  strictEqual(loadSkill("not-a-skill"), undefined);
});

test("every registered skill body matches its manifest", () => {
  strictEqual(validateSkills().join("\n"), "");
});
