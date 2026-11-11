import assert from "node:assert/strict";
import test from "node:test";
import { withReadableProjectTimes } from "@atte/kit/project-tool-utils";

const snapshot = {
  id: "project-1",
  assets: [{ id: "library:a", name: "mirror-clip1.mp4", mediaType: "video", duration: "2407680" }],
  sequences: [{
    id: "sequence-1",
    markers: [{ id: "marker-1", at: "120000" }],
    tracks: [{
      id: "track-1",
      kind: "video",
      elements: [{
        id: "element-1",
        assetId: "library:a",
        timelineRange: { start: "2407680", duration: "1447680" },
        sourceRange: { start: "0", duration: "1447680" },
      }],
    }],
  }],
};

test("the model-facing snapshot reports seconds beside every tick value", () => {
  const readable = withReadableProjectTimes(snapshot) as typeof snapshot & { assets: Array<{ durationSeconds: number }> };
  assert.equal(readable.assets[0]!.durationSeconds, 20.064);
  const element = readable.sequences[0]!.tracks[0]!.elements[0]! as unknown as {
    timelineRange: { start: string; startSeconds: number; durationSeconds: number; endSeconds: number };
    sourceRange: { durationSeconds: number };
  };
  assert.equal(element.timelineRange.startSeconds, 20.064);
  assert.equal(element.timelineRange.durationSeconds, 12.064);
  assert.equal(element.timelineRange.endSeconds, 32.128);
  assert.equal(element.sourceRange.durationSeconds, 12.064);
  const marker = readable.sequences[0]!.markers[0]! as unknown as { atSeconds: number };
  assert.equal(marker.atSeconds, 1);
});

test("tick values survive unchanged so tool inputs keep working", () => {
  const readable = withReadableProjectTimes(snapshot) as unknown as {
    assets: Array<{ duration: string }>;
    sequences: Array<{ tracks: Array<{ elements: Array<{ timelineRange: { start: string; duration: string } }> }> }>;
  };
  assert.equal(readable.assets[0]!.duration, "2407680");
  assert.deepEqual(readable.sequences[0]!.tracks[0]!.elements[0]!.timelineRange.start, "2407680");
  assert.deepEqual(readable.sequences[0]!.tracks[0]!.elements[0]!.timelineRange.duration, "1447680");
});
