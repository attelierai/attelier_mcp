import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePublicArguments } from "./public-boundary.js";
import { mapPublicEditCalls } from "./compile-edit-boundary.js";
import { ATTE_PUBLIC_TOOLS } from "./public-tools.js";
import { DEFAULT_ATTE_SKILLS_ROOT } from "./skill-loader.js";
import { ATTELIER_SKILLS } from "./skill-registry.js";

type SkillCall = { tool: string; arguments: Record<string, unknown> };

const callBlocks = (content: string): string[] =>
  [...content.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map((match) => match[1]!.trim());

test("every executable registered skill call matches the public MCP catalog", () => {
  const tools = new Map(ATTE_PUBLIC_TOOLS.map((tool) => [tool.name, tool]));
  for (const skill of ATTELIER_SKILLS) {
    const relative = skill.path.replace(/^skills\//, "");
    const content = readFileSync(new URL(relative, `file://${DEFAULT_ATTE_SKILLS_ROOT.replace(/\/*$/, "/")}`), "utf8");
    const blocks = callBlocks(content);
    if (skill.audience === "agent") {
      assert.ok(blocks.length > 0, `${skill.id} is agent-visible but has no fenced JSON call`);
    }
    for (const [index, block] of blocks.entries()) {
      let call: SkillCall;
      try {
        call = JSON.parse(block) as SkillCall;
      } catch (error) {
        assert.fail(`${skill.id} call ${index + 1} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      assert.deepEqual(Object.keys(call).sort(), ["arguments", "tool"], `${skill.id} call ${index + 1} must contain only tool and arguments`);
      assert.equal(typeof call.tool, "string", `${skill.id} call ${index + 1} tool must be a string`);
      assert.ok(call.arguments && typeof call.arguments === "object" && !Array.isArray(call.arguments), `${skill.id} call ${index + 1} arguments must be an object`);
      const definition = tools.get(call.tool);
      assert.ok(definition, `${skill.id} call ${index + 1} names non-public tool ${call.tool}`);
      assert.doesNotThrow(
        () => validatePublicArguments(call.arguments, definition.inputSchema),
        `${skill.id} call ${index + 1} does not match ${call.tool}`,
      );
      if (call.tool === "compile_edit") {
        assert.doesNotThrow(
          () => mapPublicEditCalls(call.arguments.calls as Array<{ tool: string; arguments: Record<string, unknown> }>),
          `${skill.id} call ${index + 1} contains an invalid compile_edit call`,
        );
      }
    }
  }
});
