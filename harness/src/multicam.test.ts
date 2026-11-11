import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@attelier/project-schema";
import { compileMulticamSwitchPlan, MulticamError } from "./multicam.js";

const project: Project = {
  schemaVersion: 2, id: "p", name: "Multicam", revision: 3, activeSequenceId: "main", appliedTransactionIds: [],
  assets: [{ id: "a", name: "A", mediaType: "video", role: "original", duration: "480000" as never, channels: 2, storage: [] }, { id: "b", name: "B", mediaType: "video", role: "original", duration: "480000" as never, channels: 2, storage: [] }],
  sequences: [{ id: "main", name: "Main", canvas: { width: 1920, height: 1080 }, frameRate: { numerator: 30, denominator: 1 }, tracks: [{ id: "v1", name: "A", kind: "video", order: 0, locked: false, muted: false, hidden: false, elements: [{ id: "ea", name: "A", kind: "video", assetId: "a", timelineRange: { start: "0" as never, duration: "480000" as never }, properties: {}, keyframes: [] }] }, { id: "v2", name: "B", kind: "video", order: 1, locked: false, muted: false, hidden: false, elements: [{ id: "eb", name: "B", kind: "video", assetId: "b", timelineRange: { start: "0" as never, duration: "480000" as never }, properties: {}, keyframes: [] }] }] }],
};

const request = { groupId: "g1", angles: [{ id: "wide", elementId: "ea" }, { id: "close", elementId: "eb" }], switches: [{ at: "0" as never, angleId: "wide" }, { at: "240000" as never, angleId: "close" }], audioAngleId: "wide" };

test("compiles aligned multicam switches to a real reversible program cut", () => {
  const plan = compileMulticamSwitchPlan(project, request);
  assert.equal(plan.operations.length, 4);
  assert.equal(plan.operations[0]?.type, "replaceElement");
  assert.equal((plan.operations[0] as { element: { properties: Record<string, unknown> } }).element.properties["multicam.preAligned"], true);
  const programVideo = plan.operations[2];
  assert.equal(programVideo?.type, "addTrack");
  if (programVideo?.type !== "addTrack") throw new Error("Expected a program track.");
  assert.deepEqual(programVideo.track.elements.map(({ assetId, timelineRange, sourceRange }) => ({ assetId, timelineRange, sourceRange })), [
    { assetId: "a", timelineRange: { start: "0", duration: "240000" }, sourceRange: { start: "0", duration: "240000" } },
    { assetId: "b", timelineRange: { start: "240000", duration: "240000" }, sourceRange: { start: "240000", duration: "240000" } },
  ]);
  const programAudio = plan.operations[3];
  assert.equal(programAudio?.type, "addTrack");
  if (programAudio?.type !== "addTrack") throw new Error("Expected a program audio track.");
  assert.equal(programAudio.track.elements[0]?.assetId, "a");
  assert.equal(programAudio.track.elements[0]?.kind, "audio");
  assert.equal(project.revision, 3);
});

test("rejects gaps, foreign IDs, non-video and misaligned ranges", () => {
  assert.throws(() => compileMulticamSwitchPlan(project, { ...request, switches: [{ at: "120000" as never, angleId: "wide" }] }), MulticamError);
  assert.throws(() => compileMulticamSwitchPlan(project, { ...request, audioAngleId: "missing" }), /audioAngleId/);
  assert.throws(() => compileMulticamSwitchPlan(project, { ...request, angles: [{ id: "wide", elementId: "ea" }, { id: "foreign", elementId: "nope" }] }), /existing video/);
  const shifted = structuredClone(project); shifted.sequences[0]!.tracks[1]!.elements[0]!.timelineRange.start = "1" as never;
  assert.throws(() => compileMulticamSwitchPlan(shifted, request), /pre-aligned/);
  assert.throws(() => compileMulticamSwitchPlan(project, { ...request, switches: [{ at: "0" as never, angleId: "wide" }, { at: "120000" as never, angleId: "wide" }] }), /different angles/);
  const foreignSequence = structuredClone(project);
  foreignSequence.sequences.push({ ...structuredClone(foreignSequence.sequences[0]!), id: "other", tracks: [{ ...structuredClone(foreignSequence.sequences[0]!.tracks[0]!), elements: [{ ...structuredClone(foreignSequence.sequences[0]!.tracks[0]!.elements[0]!), id: "other-angle" }] }] });
  assert.throws(() => compileMulticamSwitchPlan(foreignSequence, { ...request, angles: [{ id: "wide", elementId: "ea" }, { id: "other", elementId: "other-angle" }] }), /active sequence/);

  const retimed = structuredClone(project);
  retimed.sequences[0]!.tracks[0]!.elements[0]!.properties["playback.rate"] = 2;
  assert.throws(() => compileMulticamSwitchPlan(retimed, request), /normal forward playback/);

  const reversed = structuredClone(project);
  reversed.sequences[0]!.tracks[0]!.elements[0]!.properties["playback.reverse"] = true;
  assert.throws(() => compileMulticamSwitchPlan(reversed, request), /normal forward playback/);

  const silent = structuredClone(project);
  silent.assets[0]!.channels = 0;
  assert.throws(() => compileMulticamSwitchPlan(silent, request), /no measured audio stream/);
});
