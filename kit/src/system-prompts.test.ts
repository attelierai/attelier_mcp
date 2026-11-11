import { match, doesNotMatch, ok } from "node:assert/strict";
import test from "node:test";
import { ATTE_LANGUAGE_RULE } from "./language.js";
import { ATTE_CREATE_SYSTEM_PROMPT, ATTE_STUDIO_SYSTEM_PROMPT, atteCreateSystemPrompt, atteStudioSystemPromptForQualityProfile } from "./system-prompts.js";

test("every rendered Atte surface prompt starts with the language contract and can carry a hint", () => {
  for (const prompt of [
    ATTE_STUDIO_SYSTEM_PROMPT,
    ATTE_CREATE_SYSTEM_PROMPT,
    atteStudioSystemPromptForQualityProfile("product-ad-v1"),
    atteStudioSystemPromptForQualityProfile("documentary-v1"),
  ]) ok(prompt.startsWith(ATTE_LANGUAGE_RULE));

  const spanish = atteStudioSystemPromptForQualityProfile(undefined, "Spanish");
  ok(spanish.startsWith(ATTE_LANGUAGE_RULE));
  match(spanish, /Detected user language: Spanish/);
});

test("Studio modes preserve scoped authority and targeted corrections", () => {
  for (const profile of [undefined, "product-ad-v1", "documentary-v1"]) {
    const autopilot = atteStudioSystemPromptForQualityProfile(profile, undefined, "autopilot");
    match(autopilot, /AUTOPILOT\. Execute clear corrections directly/);
    match(autopilot, /Preserve approved creative choices/);
    doesNotMatch(autopilot, /ask ONE short question and stop/);

    for (const guided of [
      atteStudioSystemPromptForQualityProfile(profile, undefined, "guided"),
      atteStudioSystemPromptForQualityProfile(profile),
    ]) {
      match(guided, /GUIDED\. Spend only within the creator/);
      match(guided, /ask ONE short question and stop/);
      doesNotMatch(guided, /AUTOPILOT\./);
    }
  }
});

test("the Create hub prompt swaps CLARIFY BEFORE YOU SPEND for the autopilot block", () => {
  const autopilot = atteCreateSystemPrompt("autopilot");
  match(autopilot, /AUTOPILOT\. Execute clear corrections directly/);
  doesNotMatch(autopilot, /CLARIFY BEFORE YOU SPEND/);
  ok(autopilot.startsWith(ATTE_LANGUAGE_RULE));

  match(atteCreateSystemPrompt("guided"), /CLARIFY BEFORE YOU SPEND/);
  match(ATTE_CREATE_SYSTEM_PROMPT, /CLARIFY BEFORE YOU SPEND/);
});
