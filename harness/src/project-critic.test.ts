import assert from "node:assert/strict";
import test from "node:test";
import { secondsToTicks, type Project, type TimelineElement } from "@attelier/project-schema";
import {
  critiqueProjectDeterministically,
  findMidWordCuts,
  findRepeatedLines,
  type CriticSpeechSource,
} from "./project-critic.js";

const clip = (
  id: string,
  assetId: string,
  timeline: [start: number, duration: number],
  source: [start: number, duration: number],
  properties: Record<string, unknown> = {},
): TimelineElement => ({
  id,
  name: id,
  kind: "video",
  assetId,
  timelineRange: { start: secondsToTicks(timeline[0]), duration: secondsToTicks(timeline[1]) },
  sourceRange: { start: secondsToTicks(source[0]), duration: secondsToTicks(source[1]) },
  properties,
  keyframes: [],
});

const project = (elements: TimelineElement[]): Project => ({
  schemaVersion: 3,
  id: "project-critic-fixture",
  name: "Critic fixture",
  revision: 1,
  activeSequenceId: "sequence-1",
  assets: [],
  sequences: [{
    id: "sequence-1",
    name: "Master",
    canvas: { width: 1920, height: 1080 },
    frameRate: { numerator: 24, denominator: 1 },
    tracks: [{ id: "track-video", name: "V1", kind: "video", muted: false, hidden: false, locked: false, elements }],
  }],
} as unknown as Project);

const speech = (
  assetId: string,
  words: Array<[text: string, start: number, end: number]>,
): CriticSpeechSource => ({
  assetId,
  words: words.map(([text, startSeconds, endSeconds]) => ({ text, startSeconds, endSeconds })),
});

test("mid-word cuts are found on both edges and reported in source time", () => {
  const cuts = findMidWordCuts(
    project([
      clip("a", "asset-a", [0, 4.4], [0, 4.4]),
      clip("b", "asset-b", [4.4, 5], [0.6, 5]),
    ]),
    [
      speech("asset-a", [["we", 3.4, 3.7], ["together", 4.0, 4.8]]),
      speech("asset-b", [["and", 0.5, 0.8], ["then", 0.8, 1.1]]),
    ],
  );
  assert.deepEqual(cuts.map(({ elementId, edge, word }) => [elementId, edge, word]), [
    ["a", "out", "together"],
    ["b", "in", "and"],
  ]);
  const [outgoing, incoming] = cuts;
  assert.equal(outgoing!.sourceSeconds, 4.4);
  assert.equal(outgoing!.clippedSeconds, 0.4);
  assert.equal(outgoing!.atSeconds, 4.4);
  assert.equal(incoming!.clippedSeconds, 0.1);
  // The incoming clip's cut is reported at the timeline second it is heard.
  assert.equal(incoming!.atSeconds, 4.4);
});

test("a boundary cut, a muted clip and a contiguous split are all left alone", () => {
  const words = [speech("asset-a", [["we", 3.4, 3.7], ["together", 4.0, 4.8]])];
  assert.deepEqual(findMidWordCuts(project([clip("a", "asset-a", [0, 4.8], [0, 4.8])]), words), []);
  assert.deepEqual(
    findMidWordCuts(project([clip("a", "asset-a", [0, 4.4], [0, 4.4], { "audio.muted": true })]), words),
    [],
  );
  assert.deepEqual(
    findMidWordCuts(project([
      clip("a1", "asset-a", [0, 4.4], [0, 4.4]),
      clip("a2", "asset-a", [4.4, 2], [4.4, 2]),
    ]), words),
    [],
  );
  // With no transcripts at all the checks are simply inert.
  assert.deepEqual(findMidWordCuts(project([clip("a", "asset-a", [0, 4.4], [0, 4.4])]), []), []);
});

test("a phrase carried across a cut by two takes is reported once", () => {
  const repeats = findRepeatedLines(
    project([
      clip("a", "asset-a", [0, 3], [0, 3]),
      clip("b", "asset-b", [3, 3], [10, 3]),
    ]),
    [
      speech("asset-a", [["so", 1.0, 1.2], ["we", 2.2, 2.4], ["are", 2.4, 2.6], ["done", 2.6, 2.9]]),
      speech("asset-b", [["we", 10.1, 10.3], ["are", 10.3, 10.5], ["done", 10.5, 10.8], ["here", 11.0, 11.3]]),
    ],
  );
  assert.equal(repeats.length, 1);
  assert.equal(repeats[0]!.text, "we are done");
  assert.deepEqual(repeats[0]!.elementIds, ["a", "b"]);
  assert.ok(repeats[0]!.gapSeconds > 0 && repeats[0]!.gapSeconds <= 3);
});

test("a single repeated ordinary word is not a repeated line", () => {
  const repeats = findRepeatedLines(
    project([
      clip("a", "asset-a", [0, 3], [0, 3]),
      clip("b", "asset-b", [3, 3], [0, 3]),
    ]),
    [
      speech("asset-a", [["the", 2.5, 2.7], ["end", 2.7, 2.9]]),
      speech("asset-b", [["the", 0.1, 0.3], ["start", 0.3, 0.6]]),
    ],
  );
  assert.deepEqual(repeats, []);
});

test("speech findings reach the critic as warnings, never as export blockers", () => {
  const issues = critiqueProjectDeterministically(
    project([
      clip("a", "asset-a", [0, 4.4], [0, 4.4]),
      clip("b", "asset-b", [4.4, 5], [0.6, 5]),
    ]),
    { speech: [
      speech("asset-a", [["together", 4.0, 4.8]]),
      speech("asset-b", [["and", 0.5, 0.8]]),
    ] },
  );
  const speechIssues = issues.filter((issue) => issue.code === "cut_mid_word" || issue.code === "repeated_line");
  assert.equal(speechIssues.length, 2);
  assert.ok(speechIssues.every((issue) => issue.severity === "warning"));
  // The context is optional: existing callers keep the behaviour they had.
  assert.deepEqual(
    critiqueProjectDeterministically(project([clip("a", "asset-a", [0, 4.4], [0, 4.4])]))
      .filter((issue) => issue.code === "cut_mid_word"),
    [],
  );
});

test("product proof and social title bounds are profile-aware", () => {
  const title: TimelineElement = {
    id: "headline", name: "A documentary chapter", kind: "text",
    timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(3) },
    properties: {
      "text.content": "A documentary chapter",
      "text.role": "headline",
      "text.align": "left",
      "style.fontSize": 72,
      "transform.position": [0.06, 0.90],
    },
    keyframes: [],
  };
  const fixture = project([title]);
  const documentary = critiqueProjectDeterministically(fixture, { qualityProfile: "documentary-v1" });
  assert.ok(!documentary.some(({ code }) => code === "narration_visual_gap"));
  assert.ok(!documentary.some(({ code }) => code === "title_outside_safe_area"));

  const productAd = critiqueProjectDeterministically(fixture, { qualityProfile: "product-ad-v1" });
  assert.ok(productAd.some(({ code }) => code === "narration_visual_gap"));
  assert.ok(productAd.some(({ code }) => code === "title_outside_safe_area"));
});
