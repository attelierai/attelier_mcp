import assert from "node:assert/strict";
import test from "node:test";
import { ATTELIER_SKILLS } from "./skill-registry.js";
import { ATTELIER_USE_CASES, attelierUseCase } from "./use-case-registry.js";

test("every use-case skill has one live playbook and typed feature surface", () => {
  const skillIds = ATTELIER_SKILLS
    .filter(({ kind }) => kind === "use-case")
    .map(({ id }) => id);
  assert.deepEqual(ATTELIER_USE_CASES.map(({ id }) => id), skillIds);
  assert.ok(ATTELIER_USE_CASES.every(({ playbook, featureFamilies }) => playbook.steps.length > 0 && featureFamilies.length > 0));
});
