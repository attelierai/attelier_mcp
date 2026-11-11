import assert from "node:assert/strict";
import test from "node:test";
import { secondsToTicks, type Project } from "@attelier/project-schema";
import { compileSourceEdit, SourceEditError } from "./source-edit.js";

const project = (): Project => ({
  schemaVersion: 3,
  id: "project",
  name: "Source edit",
  revision: 0,
  activeSequenceId: "sequence",
  appliedTransactionIds: [],
  assets: [{
    id: "asset-video",
    name: "Interview",
    mediaType: "video",
    role: "original",
    duration: secondsToTicks(20),
    storage: [],
  }],
  sequences: [{
    id: "sequence",
    name: "Main",
    canvas: { width: 1920, height: 1080 },
    frameRate: { numerator: 30, denominator: 1 },
    markers: [],
    linkGroups: [],
    tracks: [{
      id: "video-1",
      name: "Video",
      kind: "video",
      order: 0,
      locked: false,
      muted: false,
      hidden: false,
      elements: [],
    }],
  }],
});

test("compileSourceEdit preserves exact source ticks and atomic edit mode", () => {
  const plan = compileSourceEdit(project(), {
    assetId: "asset-video",
    sourceRange: { start: secondsToTicks(2), duration: secondsToTicks(4.5) },
    timelineStart: secondsToTicks(7),
    mode: "overwrite",
    idPrefix: "source-1",
  });
  assert.equal(plan.trackId, "video-1");
  assert.equal(plan.operations.length, 1);
  assert.deepEqual(plan.operations[0], {
    type: "insertOverwrite",
    trackId: "video-1",
    mode: "overwrite",
    generatedIdPrefix: "source-1-split",
    element: {
      id: "source-1-element",
      name: "Interview",
      kind: "video",
      assetId: "asset-video",
      timelineRange: { start: secondsToTicks(7), duration: secondsToTicks(4.5) },
      sourceRange: { start: secondsToTicks(2), duration: secondsToTicks(4.5) },
      properties: { "transform.fit": "contain" },
      keyframes: [],
    },
  });
});

test("compileSourceEdit creates a compatible track and rejects invalid source ranges", () => {
  const withoutTracks = project();
  withoutTracks.sequences[0]!.tracks = [];
  const plan = compileSourceEdit(withoutTracks, {
    assetId: "asset-video",
    sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
    timelineStart: secondsToTicks(0),
    mode: "insert",
    idPrefix: "source-2",
  });
  assert.deepEqual(plan.operations.map(({ type }) => type), ["addTrack", "insertOverwrite"]);
  assert.throws(() => compileSourceEdit(project(), {
    assetId: "asset-video",
    sourceRange: { start: secondsToTicks(19), duration: secondsToTicks(2) },
    timelineStart: secondsToTicks(0),
    mode: "insert",
    idPrefix: "source-3",
  }), SourceEditError);
});
