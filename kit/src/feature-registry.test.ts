import assert from "node:assert/strict";
import test from "node:test";
import { ATTELIER_EDITOR_OPENAI_TOOLS } from "./tool-catalog.js";
import {
  ATTELIER_FEATURES,
  ATTELIER_FEATURE_FAMILIES,
} from "./feature-registry.js";

test("every Studio tool is one typed feature in exactly one family", () => {
  const catalogNames = ATTELIER_EDITOR_OPENAI_TOOLS.map(({ function: fn }) => fn.name);
  const featureNames = ATTELIER_FEATURES.map(({ toolName }) => toolName);
  assert.deepEqual(featureNames, catalogNames);
  assert.equal(new Set(featureNames).size, featureNames.length);
  assert.ok(ATTELIER_FEATURES.every(({ family }) => ATTELIER_FEATURE_FAMILIES.includes(family)));
});
