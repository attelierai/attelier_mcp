import assert from "node:assert/strict";
import test from "node:test";
import { ATTELIER_CREATIVE_ROUTER_VERSION, detectProposalAction, planCreativePrompt } from "./creative-router.js";

test("creative routing is versioned and composes generation dependencies", () => {
  const plan = planCreativePrompt("Crea un video vertical de un producto con música épica y subtítulos");
  assert.equal(plan?.routerVersion, ATTELIER_CREATIVE_ROUTER_VERSION);
  assert.equal(plan?.generation.kind, "video");
  assert.equal(plan?.resolutionId, "9:16");
  assert.deepEqual(plan?.audio, { kind: "music", content: "épica" });
  assert.equal(plan?.wantsCaptions, true);
});

test("creative routing fixes the empty-project creation regression without hijacking edits", () => {
  assert.deepEqual(planCreativePrompt("Puedes hacer un video de Messi triste")?.generation, { kind: "video", content: "Messi triste" });
  assert.equal(planCreativePrompt("Haz el vídeo más corto"), undefined);
  assert.equal(planCreativePrompt("Usa este vídeo y recórtalo"), undefined);
});

test("creative routing chains image animation and keeps proposal actions explicit", () => {
  const plan = planCreativePrompt("Crea una imagen de un coche y anímala con movimiento suave");
  assert.deepEqual(plan?.generation, { kind: "image", content: "un coche" });
  assert.deepEqual(plan?.animateAfterImage, { motion: "movimiento suave" });
  assert.equal(detectProposalAction("aplica"), "apply");
  assert.equal(detectProposalAction("aplica un look cálido"), undefined);
});
