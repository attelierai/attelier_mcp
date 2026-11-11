import assert from "node:assert/strict";
import test from "node:test";
import { CREATE_STYLES, compileCreateStyleInput, readCreateStyleSource } from "./create-styles.js";

test("style compilation preserves the source, model and parameters without stacking recipes", () => {
  for (const style of CREATE_STYLES) {
    const source = { id: style.id, version: 1, sourcePrompt: 'Dos gatos azules; texto exacto: "Hola"' };
    const raw = { prompt: source.sourcePrompt, providerId: "chosen-model", width: 512, createStyle: source };
    const compiled = compileCreateStyleInput("text_to_image", raw) as typeof raw;
    assert.ok(compiled.prompt.includes(source.sourcePrompt));
    assert.ok(compiled.prompt.includes(style.recipe));
    assert.equal(compiled.providerId, raw.providerId);
    assert.equal(compiled.width, 512);
    assert.deepEqual(compiled.createStyle, source);
    assert.deepEqual(compileCreateStyleInput("text_to_image", compiled), compiled);
    assert.equal(raw.prompt, source.sourcePrompt);
  }
});

test("unstyled inputs are untouched; styles reject incompatible tasks and unknown recipes", () => {
  const raw = { prompt: "A fox", providerId: "chosen" };
  assert.equal(compileCreateStyleInput("text_to_image", raw), raw);
  const createStyle = { id: "anime", version: 1, sourcePrompt: "A fox" };
  assert.throws(() => compileCreateStyleInput("text_to_video", { ...raw, createStyle }));
  for (const invalid of [null, { ...createStyle, id: "invented" }, { ...createStyle, version: 2 }, { ...createStyle, sourcePrompt: " " }]) {
    assert.equal(readCreateStyleSource(invalid), undefined);
    assert.throws(() => compileCreateStyleInput("text_to_image", { ...raw, createStyle: invalid }));
  }
});

test("restyling preserves source-image intent", () => {
  const result = compileCreateStyleInput("image_to_image", { imageUploadUrl: "https://example.test/fox.png", createStyle: { id: "anime", version: 1, sourcePrompt: "Keep the same fox" } }) as { prompt: string; imageUploadUrl: string };
  assert.match(result.prompt, /preserving its subjects, identity and layout/);
  assert.equal(result.imageUploadUrl, "https://example.test/fox.png");
});
