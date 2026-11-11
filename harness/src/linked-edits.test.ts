import assert from "node:assert/strict";
import test from "node:test";
import {
  secondsToTicks,
  type Sequence,
  type TimelineElement,
} from "@attelier/project-schema";
import {
  LinkedEditPlanError,
  findLinkGroupForElement,
  planLinkedDelete,
  planLinkedMove,
  planLinkedTrim,
} from "./linked-edits.js";

const element = (
  id: string,
  start = 2,
  duration = 4,
  sourceStart = 1,
): TimelineElement => ({
  id,
  name: id,
  kind: id.startsWith("audio") ? "audio" : "video",
  assetId: `asset-${id}`,
  timelineRange: { start: secondsToTicks(start), duration: secondsToTicks(duration) },
  sourceRange: { start: secondsToTicks(sourceStart), duration: secondsToTicks(duration) },
  properties: {},
  keyframes: [],
});

const sequence = (): Sequence => ({
  id: "sequence-main",
  name: "Main",
  canvas: { width: 1920, height: 1080 },
  frameRate: { numerator: 30, denominator: 1 },
  tracks: [
    {
      id: "video",
      name: "Video",
      kind: "video",
      order: 0,
      locked: false,
      muted: false,
      hidden: false,
      elements: [element("video", 2, 4, 10)],
    },
    {
      id: "audio",
      name: "Audio",
      kind: "audio",
      order: 1,
      locked: false,
      muted: false,
      hidden: false,
      elements: [element("audio", 2, 4, 30)],
    },
  ],
  linkGroups: [{ id: "av", elementIds: ["video", "audio"] }],
});

test("linked move and trim preserve group sync and per-source offsets", () => {
  const move = planLinkedMove(sequence(), "video", secondsToTicks(8));
  assert.deepEqual(move.map(({ type }) => type), [
    "deleteLinkGroup",
    "moveElement",
    "moveElement",
    "addLinkGroup",
  ]);
  assert.deepEqual(move[2], {
    type: "moveElement",
    elementId: "audio",
    start: secondsToTicks(8),
  });

  const trim = planLinkedTrim(sequence(), "video", {
    timelineRange: { start: secondsToTicks(3), duration: secondsToTicks(2) },
    sourceRange: { start: secondsToTicks(11), duration: secondsToTicks(2) },
  });
  assert.deepEqual(trim.map(({ type }) => type), [
    "deleteLinkGroup",
    "trimElement",
    "trimElement",
    "addLinkGroup",
  ]);
  assert.deepEqual(trim[2], {
    type: "trimElement",
    elementId: "audio",
    timelineRange: { start: secondsToTicks(3), duration: secondsToTicks(2) },
    sourceRange: { start: secondsToTicks(31), duration: secondsToTicks(2) },
  });
});

test("linked deletion removes metadata first and invalid groups fail closed", () => {
  assert.deepEqual(planLinkedDelete(sequence(), "audio"), [
    { type: "deleteLinkGroup", sequenceId: "sequence-main", linkGroupId: "av" },
    { type: "deleteElement", elementId: "video" },
    { type: "deleteElement", elementId: "audio" },
  ]);

  const ambiguous = sequence();
  ambiguous.linkGroups!.push({ id: "also-av", elementIds: ["video", "audio"] });
  assert.throws(
    () => findLinkGroupForElement(ambiguous, "video"),
    LinkedEditPlanError,
  );
});

test("linked edits fail closed for locked and asynchronous members", () => {
  const locked = sequence();
  locked.tracks[1]!.locked = true;
  assert.throws(
    () => planLinkedMove(locked, "video", secondsToTicks(3)),
    /locked track/,
  );

  const asynchronous = sequence();
  asynchronous.tracks[1]!.elements[0]!.timelineRange.start = secondsToTicks(3);
  assert.throws(
    () =>
      planLinkedTrim(asynchronous, "video", {
        timelineRange: { start: secondsToTicks(3), duration: secondsToTicks(2) },
        sourceRange: { start: secondsToTicks(11), duration: secondsToTicks(2) },
      }),
    /share the same timeline range/,
  );
});
