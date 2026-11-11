import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTELIER_ACTION_TOOL_NAMES,
  ATTELIER_EDITOR_OPENAI_TOOLS,
  ATTELIER_GENERATE_OPENAI_TOOLS,
  ATTELIER_TOOL_PROFILES,
  attelierToolNamesForProfile,
  atteCatalogProfilesForQualityProfile,
  type AttelierToolProfile,
} from "./tool-catalog.js";
import { ATTE_PUBLIC_TOOL_NAMES, mcpToolsForQualityProfile } from "./mcp-tool-catalog.js";

test("every tool profile lists unique tools and the action and generate subsets come from the Studio catalog", () => {
  for (const profile of Object.keys(ATTELIER_TOOL_PROFILES) as AttelierToolProfile[]) {
    const names = attelierToolNamesForProfile(profile);
    assert.equal(new Set(names).size, names.length, `${profile} contains duplicate tool names`);
    assert.ok(names.length > 0, `${profile} has no tools`);
  }
  const studioNames = new Set<string>(ATTELIER_EDITOR_OPENAI_TOOLS.map(({ function: fn }) => fn.name));
  assert.ok(ATTELIER_GENERATE_OPENAI_TOOLS.every(({ function: fn }) => studioNames.has(fn.name)));
  assert.ok([...ATTELIER_ACTION_TOOL_NAMES].every((name) => studioNames.has(name)));
  for (const tool of ATTELIER_EDITOR_OPENAI_TOOLS) assert.ok(tool.profiles.length > 0, `${tool.function.name} has no catalog profile`);
});

test("project quality profiles narrow the MCP catalog without dropping the public surface", () => {
  assert.deepEqual(atteCatalogProfilesForQualityProfile("documentary-v1"), ["documentary", "shared"]);
  assert.deepEqual(atteCatalogProfilesForQualityProfile("product-ad-v1"), ["ad", "shared"]);
  assert.deepEqual(atteCatalogProfilesForQualityProfile("social-video-v1"), ["shorts", "shared"]);
  assert.deepEqual(atteCatalogProfilesForQualityProfile(undefined), ["shared"]);
  const documentary = new Set(mcpToolsForQualityProfile("documentary-v1").map(({ name }) => name));
  const ad = new Set(mcpToolsForQualityProfile("product-ad-v1").map(({ name }) => name));
  assert.ok(documentary.has("add_lower_third"));
  assert.equal(ad.has("add_lower_third"), false);
  for (const name of ATTE_PUBLIC_TOOL_NAMES) assert.ok(documentary.has(name) && ad.has(name), `${name} left the public surface`);
});
