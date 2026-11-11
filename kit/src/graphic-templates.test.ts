import assert from "node:assert/strict";
import test from "node:test";
import { graphicTemplate } from "./graphic-templates.js";

test("unknown template ids do not fall through to inherited object keys", () => {
  assert.equal(graphicTemplate("toString"), undefined);
  assert.equal(graphicTemplate("unknown"), undefined);
});
