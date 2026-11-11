import assert from "node:assert/strict";
import test from "node:test";
import {
  routeAttelierMediaModel,
  type AttelierRouteCandidate,
} from "./model-router.js";

const candidates: AttelierRouteCandidate[] = [
  { id: "video-premium", family: "video", providerId: "fal", modelId: "video-premium", capability: "text_to_video", available: true, qualityScore: 0.98, estimatedCostUsd: 0.2, latencyMs: 2500, evidenceStatus: "provider-declared", evidenceVersion: "provider" },
  { id: "video-balanced", family: "video", providerId: "fal", modelId: "video-balanced", capability: "text_to_video", available: true, qualityScore: 0.88, estimatedCostUsd: 0.05, latencyMs: 800, evidenceStatus: "provider-declared", evidenceVersion: "provider", fallbackIds: ["video-cheap"] },
  { id: "video-cheap", family: "video", providerId: "local", modelId: "video-cheap", capability: "text_to_video", available: true, qualityScore: 0.72, estimatedCostUsd: 0.01, latencyMs: 250, evidenceStatus: "provider-declared", evidenceVersion: "provider" },
  { id: "image-cheap", family: "image", providerId: "local", modelId: "image-cheap", capability: "text_to_image", available: true, qualityScore: 1, estimatedCostUsd: 0, latencyMs: 1, evidenceStatus: "admitted", evidenceVersion: "provider" },
  { id: "video-unverified", family: "video", providerId: "lab", modelId: "unsafe", capability: "text_to_video", available: true, qualityScore: 1, estimatedCostUsd: 0, latencyMs: 1, evidenceStatus: "unverified", evidenceVersion: "none" },
];

test("each automatic media router ranks only candidates inside its own family and capability", () => {
  const quality = routeAttelierMediaModel({ selection: { mode: "auto", policy: "quality" }, target: "video", capability: "text_to_video", intent: "cinematic orbit", candidates });
  const cost = routeAttelierMediaModel({ selection: { mode: "auto", policy: "cost" }, target: "video", capability: "text_to_video", intent: "quick draft", candidates });
  assert.equal(quality.selected.id, "video-premium");
  assert.equal(cost.selected.id, "video-cheap");
  assert.equal(quality.ranked.some(({ family }) => family !== "video"), false);
  assert.equal(quality.ranked.some(({ id }) => id === "video-unverified"), false);
});

test("manual routing is exact inside one family and never silently falls back", () => {
  const pinned = routeAttelierMediaModel({ selection: { mode: "pinned", modelId: "video-balanced" }, target: "video", capability: "text_to_video", intent: "edit", candidates });
  assert.equal(pinned.selected.id, "video-balanced");
  assert.throws(() => routeAttelierMediaModel({ selection: { mode: "pinned", modelId: "image-cheap" }, target: "video", capability: "text_to_video", intent: "edit", candidates }), /incompatible/i);
});
