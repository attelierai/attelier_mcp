import assert from "node:assert/strict";
import test from "node:test";
import { loadSkill } from "./skill-loader.js";
import {
  ATTE_PRODUCT_SKILLS,
  ATTE_PRODUCT_SKILL_CATEGORIES,
  validateProductSkills,
} from "./product-skills.js";

test("the product skill catalog is internally consistent", () => {
  assert.deepEqual(validateProductSkills(), []);
});

test("every product skill names a loadable playbook and a declared category", () => {
  for (const skill of ATTE_PRODUCT_SKILLS) {
    assert.ok(ATTE_PRODUCT_SKILL_CATEGORIES.includes(skill.category), `${skill.id} has an unknown category`);
    const playbook = loadSkill(skill.playbookSkillId);
    assert.ok(playbook?.content, `${skill.id} cannot load playbook ${skill.playbookSkillId}`);
    assert.ok(skill.inputs.some(({ required }) => required), `${skill.id} asks the creator for nothing`);
  }
});
