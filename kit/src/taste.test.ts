import assert from "node:assert/strict";
import test from "node:test";
import { HOUSE_TASTE, TASTE_CATEGORIES, houseTaste, tasteGuide } from "./taste.js";

test("every house lesson is specific, sourced and uniquely named", () => {
  const ids = new Set<string>();
  for (const lesson of HOUSE_TASTE) {
    assert.ok(!ids.has(lesson.id), `duplicate id ${lesson.id}`);
    ids.add(lesson.id);
    assert.ok(TASTE_CATEGORIES.includes(lesson.category), lesson.id);
    assert.ok(lesson.statement.length > 20 && lesson.statement.length <= 280, `${lesson.id} states one clear rule`);
    assert.ok(lesson.evidence.quote.trim() && lesson.evidence.source.trim(), `${lesson.id} keeps the words that taught it`);
  }
});

test("a format sees the general lessons plus its own, and not other formats'", () => {
  const shootout = houseTaste({ format: "shootout" }).map(({ id }) => id);
  assert.ok(shootout.includes("let-it-breathe") && shootout.includes("music-clears-voice"));
  assert.ok(!shootout.includes("screen-recordings"));
  assert.deepEqual(houseTaste({ categories: ["voice"] }).every(({ category }) => category === "voice"), true);
});

test("the guide puts the person's lessons first and invites recording new ones", () => {
  const guide = tasteGuide(houseTaste({ format: "shootout" }), [{ id: "p1", category: "copy", statement: "Never use exclamation marks." }]);
  assert.ok(guide.indexOf("Never use exclamation marks.") < guide.indexOf("## Pacing"));
  assert.match(guide, /record_preference/);
  assert.match(guide, /\*\*Rule\*\* Let each shot breathe/);
});
