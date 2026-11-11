import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTE_LANGUAGE_RULE,
  detectAtteUserLanguage,
  withAtteLanguageRule,
} from "./language.js";

test("language hint detection is deterministic across supported scripts", () => {
  assert.equal(detectAtteUserLanguage("review the cut please"), "English");
  assert.equal(detectAtteUserLanguage("revisa el corte, por favor"), "Spanish");
  assert.equal(detectAtteUserLanguage("проверь монтаж"), "Russian");
  assert.equal(detectAtteUserLanguage("请检查剪辑"), "Chinese");
  assert.equal(detectAtteUserLanguage("カットを確認して"), "Japanese");
  assert.equal(detectAtteUserLanguage("컷을 검토해 주세요"), "Korean");
  assert.equal(detectAtteUserLanguage("راجع المونتاج"), "Arabic");
  assert.equal(detectAtteUserLanguage("ok"), "English");
});

test("the language rule stays at the top when a detected hint is added", () => {
  const prompt = withAtteLanguageRule("You are Atte.", "Spanish");
  assert.ok(prompt.startsWith(ATTE_LANGUAGE_RULE));
  assert.match(prompt, /Detected user language: Spanish/);
  const replaced = withAtteLanguageRule(prompt, "English");
  assert.match(replaced, /Detected user language: English/);
  assert.doesNotMatch(replaced, /Detected user language: Spanish/);
});
