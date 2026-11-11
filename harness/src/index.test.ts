import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTELIER_AGENT_HARNESS,
  atteStudioSystemPromptForQualityProfile,
  deterministicPlannerProvenance,
  enrichPlannerProvenance,
  validateAgentHarness,
} from "./index.js";

test("documentary guidance excludes product-ad instructions", () => {
  const prompt = atteStudioSystemPromptForQualityProfile("documentary-v1");
  assert.match(prompt, /DOCUMENTARY PROFILE/);
  assert.doesNotMatch(prompt, /VOICE-LED PROMO|commercial\/ad includes|product-benefit proof/);
});

test("the checked-in harness is internally consistent", () => {
  assert.deepEqual(validateAgentHarness(), []);
  assert.equal(deterministicPlannerProvenance().harnessVersion, ATTELIER_AGENT_HARNESS.version);
});

test("run provenance records the actual planner primitives, skills and effects", () => {
  const provenance = enrichPlannerProvenance(
    deterministicPlannerProvenance(),
    [
      { name: "add_title", arguments: { text: "Launch" } },
      { name: "apply_transition", arguments: { kind: "cross-dissolve" } },
    ],
    ["Selected the explicit timeline element."],
  );
  assert.ok(provenance.tools.some(({ id }) => id === "planner.add_title"));
  assert.ok(provenance.skills.some(({ id }) => id === "typography"));
  assert.ok(provenance.skills.some(({ id }) => id === "transitions"));
  assert.deepEqual(provenance.effects.map(({ id }) => id).sort(), [
    "atelier.text.readable-overlay",
    "atelier.transition.cross-dissolve",
  ]);
  assert.ok(
    provenance.decisions.includes("Selected the explicit timeline element."),
  );

  const brightDip = enrichPlannerProvenance(deterministicPlannerProvenance(), [
    { name: "apply_transition", arguments: { kind: "dip-to-white" } },
  ]);
  assert.ok(
    brightDip.effects.some(({ id }) => id === "atelier.transition.dip-to-white"),
  );

  const measuredMotion = enrichPlannerProvenance(
    deterministicPlannerProvenance(),
    [{ name: "propose_motion_treatment", arguments: { kind: "both" } }],
  );
  assert.ok(
    measuredMotion.skills.some(({ id }) => id === "motion-design"),
  );
  assert.deepEqual(measuredMotion.effects.map(({ id }) => id).sort(), [
    "atelier.motion.motion-blur",
    "atelier.motion.stabilization",
  ]);
});
