import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@attelier/project-schema";
import { secondsToTicks } from "@attelier/project-schema";
import {
  compileLocalizationOperations,
  compileProjectToolCalls,
  compileProjectToolCallsPrepared,
} from "./project-tool-compiler.js";
import { enforceProtectedAssetPolicy } from "@atte/kit/project-tool-policy";

const fixture = (): Project => ({
  schemaVersion: 2,
  id: "compiler-project",
  name: "Compiler fixture",
  revision: 0,
  activeSequenceId: "active",
  assets: [
    {
      id: "logo",
      name: "Logo",
      mediaType: "image",
      role: "original",
      width: 512,
      height: 512,
      storage: [],
    },
    {
      id: "procedural",
      name: "Fallback",
      mediaType: "video",
      role: "generated",
      duration: secondsToTicks(2),
      storage: [],
      provenance: {
        origin: "generated",
        provider: "atelier-local",
        model: "procedural-motion-webm",
        createdAt: 1,
      },
    },
  ],
  sequences: [
    {
      id: "inactive",
      name: "Inactive",
      canvas: { width: 1920, height: 1080 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [],
    },
    {
      id: "active",
      name: "Active",
      canvas: { width: 1920, height: 1080 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [{
        id: "video",
        name: "Video",
        kind: "video",
        order: 0,
        locked: false,
        muted: false,
        hidden: false,
        elements: [{
          id: "clip",
          name: "Clip",
          kind: "video",
          assetId: "procedural",
          timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
          sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
          properties: {},
          keyframes: [],
        }],
      }],
    },
  ],
  appliedTransactionIds: [],
});

test("localization compiler adds one mastered language track, mutes only selected dialogue, and translates text", () => {
  const project = fixture();
  const sequence = project.sequences.find(({ id }) => id === project.activeSequenceId)!;
  sequence.tracks[0]!.elements.push({
    id: "dialogue-clip", name: "Interview", kind: "video", assetId: "procedural",
    timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
    sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) }, properties: {}, keyframes: [],
  }, {
    id: "role-copy", name: "Founder & CEO", kind: "text",
    timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
    properties: { "text.content": "Founder & CEO" }, keyframes: [],
  });
  const operations = compileLocalizationOperations({
    project, targetLanguage: "es", dialogueElementIds: ["dialogue-clip"],
    audioAsset: { id: "dub-es", name: "Dialogue (es)", mediaType: "audio", role: "generated", duration: secondsToTicks(2), channels: 2, storage: [] },
    graphics: [{ elementId: "role-copy", translatedText: "Fundador y CEO" }],
  });
  assert.deepEqual(operations.map(({ type }) => type), ["addAsset", "addTrack", "insertElement", "setProperty", "setProperty"]);
  assert.deepEqual(operations.filter((operation) => operation.type === "setProperty").map(({ elementId, path, value }) => ({ elementId, path, value })), [
    { elementId: "dialogue-clip", path: "audio.muted", value: true },
    { elementId: "role-copy", path: "text.content", value: "Fundador y CEO" },
  ]);
  const track = operations.find((operation) => operation.type === "addTrack");
  assert.ok(track?.type === "addTrack");
  assert.equal(track.track.name, "Dialogue (es)");
});

const audioFixture = (): Project => ({
  ...fixture(),
  assets: [{
    id: "dialogue-audio",
    name: "Dialogue.wav",
    mediaType: "audio",
    role: "original",
    duration: secondsToTicks(2),
    channels: 1,
    storage: [],
  }],
});

test("overlay batches target the active sequence and reserve unique tracks", () => {
  const operations = compileProjectToolCalls(fixture(), [
    { name: "add_overlay", arguments: { asset_id: "logo", corner: "tl" } },
    { name: "add_overlay", arguments: { asset_id: "logo", corner: "br" } },
  ]);
  const additions = operations.filter((operation) => operation.type === "addTrack");
  assert.equal(additions.length, 2);
  assert.deepEqual(additions.map(({ sequenceId }) => sequenceId), ["active", "active"]);
  assert.equal(new Set(additions.map(({ track }) => track.id)).size, 2);
});

test("batched ripple trims resolve later clips from the preceding timeline state", () => {
  const project = fixture();
  project.assets = ["a", "b", "c"].map((id) => ({
    id: `asset-${id}`,
    name: id,
    mediaType: "video" as const,
    role: "original" as const,
    duration: secondsToTicks(30),
    storage: [],
  }));
  project.sequences.find(({ id }) => id === "active")!.frameRate = { numerator: 25, denominator: 1 };
  project.sequences.find(({ id }) => id === "active")!.tracks[0]!.elements = ["a", "b", "c"].map((id, index) => ({
    id,
    name: id,
    kind: "video" as const,
    assetId: `asset-${id}`,
    timelineRange: { start: secondsToTicks(index * 5), duration: secondsToTicks(5) },
    sourceRange: { start: secondsToTicks(5 + index * 5), duration: secondsToTicks(5) },
    properties: {},
    keyframes: [],
  }));

  const operations = compileProjectToolCalls(project, [
    { name: "ripple_trim_clip", arguments: { element_id: "b", edge: "end", offset_frames: -5 } },
    { name: "ripple_trim_clip", arguments: { element_id: "c", edge: "start", offset_frames: 5 } },
  ]);
  const secondTrim = operations.filter((operation) => operation.type === "trimElement")[1];
  assert.equal(secondTrim?.type, "trimElement");
  if (secondTrim?.type === "trimElement") {
    assert.equal(secondTrim.timelineRange.start, secondsToTicks(9.8));
  }
});

test("place_asset marks dialogue for the professional local cleanup mix", () => {
  const operations = compileProjectToolCalls(audioFixture(), [{
    name: "place_asset",
    arguments: { asset_id: "dialogue-audio", at_seconds: 0, role: "dialogue" },
  }]);
  const inserted = operations.find((operation) => operation.type === "insertElement");
  assert.ok(inserted && inserted.type === "insertElement");
  assert.deepEqual(inserted.element.properties, {
    "audio.role": "dialogue",
    "effect.audio.id": "atelier.audio.professional-mix",
    "effect.audio.version": 1,
    "audio.cleanup": true,
  });
});

test("place_asset does not enable dialogue cleanup for music", () => {
  const operations = compileProjectToolCalls(audioFixture(), [{
    name: "place_asset",
    arguments: { asset_id: "dialogue-audio", at_seconds: 0, role: "music" },
  }]);
  const inserted = operations.find((operation) => operation.type === "insertElement");
  assert.ok(inserted && inserted.type === "insertElement");
  assert.equal(inserted.element.properties["audio.cleanup"], undefined);
});

test("audio lands on its own lane per role instead of stacking on Dialogue", () => {
  const project = audioFixture();
  project.assets.push(
    { ...project.assets[0]!, id: "music-audio", name: "Bed.wav" },
    { ...project.assets[0]!, id: "sfx-audio", name: "Wind.wav" },
  );
  const operations = compileProjectToolCalls(project, [
    { name: "place_asset", arguments: { asset_id: "dialogue-audio", at_seconds: 0, role: "voiceover" } },
    { name: "place_asset", arguments: { asset_id: "music-audio", at_seconds: 0, role: "music" } },
    { name: "place_asset", arguments: { asset_id: "sfx-audio", at_seconds: 0, role: "sound_effect" } },
  ]);
  const tracks = operations.filter((operation) => operation.type === "addTrack");
  assert.deepEqual(tracks.map(({ track }) => track.name).sort(), ["Dialogue", "Music", "Sound"]);
  const inserts = operations.filter((operation) => operation.type === "insertElement");
  assert.equal(inserts.length, 3);
  // Three roles, three distinct lanes: nothing shares a track.
  assert.equal(new Set(inserts.map(({ trackId }) => trackId)).size, 3);
});

test("a second clip of the same role reuses that role's existing lane", () => {
  const project = audioFixture();
  project.assets.push({ ...project.assets[0]!, id: "second-line", name: "Line two.wav" });
  const operations = compileProjectToolCalls(project, [
    { name: "place_asset", arguments: { asset_id: "dialogue-audio", at_seconds: 0, role: "voiceover" } },
    { name: "place_asset", arguments: { asset_id: "second-line", at_seconds: 5, role: "dialogue" } },
  ]);
  assert.equal(operations.filter((operation) => operation.type === "addTrack").length, 1);
  const inserts = operations.filter((operation) => operation.type === "insertElement");
  assert.equal(new Set(inserts.map(({ trackId }) => trackId)).size, 1);
});

test("batched place_asset calls append sequentially unless a call supplies its start", () => {
  const project = fixture();
  project.assets.push(
    { ...project.assets[1]!, id: "second", name: "Second", duration: secondsToTicks(3) },
    { ...project.assets[1]!, id: "third", name: "Third", duration: secondsToTicks(1) },
    { ...project.assets[1]!, id: "fourth", name: "Fourth", duration: secondsToTicks(2) },
  );
  const operations = compileProjectToolCalls(project, [
    { name: "place_asset", arguments: { asset_id: "procedural" } },
    { name: "place_asset", arguments: { asset_id: "second" } },
    { name: "place_asset", arguments: { asset_id: "third", at_seconds: 10 } },
    { name: "place_asset", arguments: { asset_id: "fourth" } },
  ]);
  const inserted = operations.flatMap((operation) => operation.type === "insertElement" ? [operation.element] : []);
  assert.deepEqual(inserted.map(({ timelineRange }) => timelineRange.start), [
    secondsToTicks(2), secondsToTicks(4), secondsToTicks(10), secondsToTicks(11),
  ]);
  assert.equal(new Set(inserted.map(({ id }) => id)).size, 4);
});

test("place_music creates a real music track and authors ducking defaults", () => {
  const project = audioFixture();
  project.assets[0]!.id = "music-asset";
  project.assets[0]!.name = "Score.wav";
  project.assets[0]!.duration = secondsToTicks(12);
  const operations = compileProjectToolCalls(project, [{
    name: "place_music",
    arguments: { asset_id: "music-asset", at_seconds: 1, end_seconds: 9 },
  }]);
  assert.deepEqual(operations.map(({ type }) => type), ["addTrack", "insertElement"]);
  const track = operations[0];
  assert.ok(track?.type === "addTrack");
  assert.equal(track.track.id, "music");
  assert.equal(track.track.kind, "audio");
  const placement = operations[1];
  assert.ok(placement?.type === "insertElement");
  assert.equal(placement.trackId, "music");
  assert.deepEqual(placement.element.timelineRange, { start: secondsToTicks(1), duration: secondsToTicks(8) });
  assert.deepEqual(placement.element.sourceRange, { start: secondsToTicks(0), duration: secondsToTicks(8) });
  assert.equal(placement.element.properties["audio.bus"], "music");
  assert.equal(placement.element.properties["audio.duck.enabled"], true);
  assert.equal(placement.element.properties["audio.duck.depthLu"], 6);
  assert.equal(placement.element.properties["audio.duck.attackMs"], 80);
  assert.equal(placement.element.properties["audio.duck.releaseMs"], 300);
  assert.equal(placement.element.properties["audio.fadeInSeconds"], undefined);
});

test("place_music reuses the music track and preserves explicit mix controls", () => {
  const project = audioFixture();
  project.assets[0]!.id = "music-asset";
  project.assets[0]!.duration = secondsToTicks(12);
  project.sequences[1]!.tracks.push({
    id: "score",
    name: "Music",
    kind: "audio",
    order: 1,
    locked: false,
    muted: false,
    hidden: false,
    elements: [],
  });
  const operations = compileProjectToolCalls(project, [{
    name: "place_music",
    arguments: {
      asset_id: "music-asset",
      at_seconds: 2,
      end_seconds: 7,
      gain_db: -9,
      duck_under_dialogue: false,
      duck_depth_lu: 8,
      duck_attack_ms: 120,
      duck_release_ms: 450,
      fade_in_seconds: 0.5,
      fade_out_seconds: 1,
    },
  }]);
  assert.deepEqual(operations.map(({ type }) => type), ["insertElement"]);
  const placement = operations[0];
  assert.ok(placement?.type === "insertElement");
  assert.equal(placement.trackId, "score");
  assert.equal(placement.element.properties["audio.gainDb"], -9);
  assert.equal(placement.element.properties["audio.duck.enabled"], false);
  assert.equal(placement.element.properties["audio.duck.depthLu"], 8);
  assert.equal(placement.element.properties["audio.duck.attackMs"], 120);
  assert.equal(placement.element.properties["audio.duck.releaseMs"], 450);
  assert.equal(placement.element.properties["audio.fadeInSeconds"], 0.5);
  assert.equal(placement.element.properties["audio.fadeOutSeconds"], 1);
});

test("place_music rejects invalid assets, ranges and duck settings", () => {
  const project = audioFixture();
  project.assets[0]!.duration = secondsToTicks(2);
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "place_music", arguments: { asset_id: "missing", end_seconds: 1 },
  }]), /Unknown asset_id/);
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "place_music", arguments: { asset_id: "dialogue-audio", at_seconds: 2, end_seconds: 1 },
  }]), /greater than at_seconds/);
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "place_music", arguments: { asset_id: "dialogue-audio", end_seconds: 1, duck_depth_lu: 31 },
  }]), /duck_depth_lu/);
});

test("fill_room_tone auto-picks the longest measured silence and loops it on ambience", () => {
  const project = fixture();
  project.assets.find(({ id }) => id === "procedural")!.channels = 2;
  project.sequences[1]!.tracks[0]!.elements.push({
    id: "short-silence",
    name: "Short silence source",
    kind: "video",
    assetId: "procedural",
    timelineRange: { start: secondsToTicks(3), duration: secondsToTicks(1) },
    sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(1) },
    properties: {},
    keyframes: [],
  });
  const operations = compileProjectToolCalls(project, [{
    name: "fill_room_tone",
    arguments: { from_seconds: 5, to_seconds: 8 },
  }], {
    audioAnalysisForAsset: () => ({ silenceRanges: [
      { start: secondsToTicks(0.1), end: secondsToTicks(0.4) },
      { start: secondsToTicks(0.8), end: secondsToTicks(1.8) },
    ] }),
  });
  assert.deepEqual(operations.map(({ type }) => type), ["addTrack", "insertElement"]);
  const placement = operations[1];
  assert.ok(placement?.type === "insertElement");
  assert.equal(placement.trackId, "ambience");
  assert.deepEqual(placement.element.timelineRange, { start: secondsToTicks(5), duration: secondsToTicks(3) });
  assert.deepEqual(placement.element.sourceRange, { start: secondsToTicks(0.8), duration: secondsToTicks(1) });
  assert.equal(placement.element.properties["audio.bus"], "ambience");
  assert.equal(placement.element.properties["audio.gainDb"], -30);
  assert.equal(placement.element.properties["audio.fadeInSeconds"], 0.06);
  assert.equal(placement.element.properties["audio.fadeOutSeconds"], 0.06);
  assert.equal(placement.element.properties["audio.loop"], true);
});

test("fill_room_tone respects a chosen source and rejects missing analysis", () => {
  const project = fixture();
  project.assets.find(({ id }) => id === "procedural")!.channels = 2;
  const operations = compileProjectToolCalls(project, [{
    name: "fill_room_tone",
    arguments: { from_seconds: 2, to_seconds: 4, source_element_id: "clip", gain_db: -24 },
  }], {
    audioAnalysisForAsset: () => ({ silenceRanges: [{ start: secondsToTicks(0.25), end: secondsToTicks(0.75) }] }),
  });
  const placement = operations.find((operation) => operation.type === "insertElement");
  assert.ok(placement?.type === "insertElement");
  assert.equal(placement.element.properties["audio.gainDb"], -24);
  assert.equal(placement.element.properties["audio.roomTone.sourceElementId"], "clip");
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "fill_room_tone", arguments: { from_seconds: 2, to_seconds: 4, source_element_id: "clip" },
  }]), /no stored measured silence/i);
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "fill_room_tone", arguments: { from_seconds: 4, to_seconds: 4 },
  }]), /greater than from_seconds/);
});

test("source range and marker tools compile to canonical v3 operations", () => {
  const project = fixture();
  project.sequences[1]!.markers = [{
    id: "marker-existing",
    name: "Old note",
    at: secondsToTicks(1),
  }];
  const operations = compileProjectToolCalls(project, [
    {
      name: "insert_source_range",
      arguments: {
        asset_id: "procedural",
        source_in_seconds: 0.25,
        source_out_seconds: 1.75,
        timeline_start_seconds: 3,
        mode: "overwrite",
        target_track_id: "video",
      },
    },
    {
      name: "add_marker",
      arguments: { at_seconds: 3, name: "Review", color: "#AABBCC" },
    },
    { name: "delete_marker", arguments: { marker_id: "marker-existing" } },
  ]);

  assert.deepEqual(operations.map(({ type }) => type), [
    "insertOverwrite",
    "addMarker",
    "deleteMarker",
  ]);
  const source = operations[0];
  assert.ok(source && source.type === "insertOverwrite");
  assert.deepEqual(source.element.sourceRange, {
    start: secondsToTicks(0.25),
    duration: secondsToTicks(1.5),
  });
  const marker = operations[1];
  assert.ok(marker && marker.type === "addMarker");
  assert.equal(marker.marker.color, "#aabbcc");
});

test("batched insert_source_range calls append from the sequence tail", () => {
  const operations = compileProjectToolCalls(fixture(), [
    {
      name: "insert_source_range",
      arguments: { asset_id: "procedural", source_in_seconds: 0, source_out_seconds: 0.5, mode: "insert", target_track_id: "video" },
    },
    {
      name: "insert_source_range",
      arguments: { asset_id: "procedural", source_in_seconds: 0.5, source_out_seconds: 1.5, mode: "insert", target_track_id: "video" },
    },
  ]);
  const inserted = operations.flatMap((operation) => operation.type === "insertOverwrite" ? [operation.element] : []);
  assert.deepEqual(inserted.map(({ timelineRange }) => timelineRange.start), [secondsToTicks(2), secondsToTicks(2.5)]);
});

test("batched insert_source_range calls reuse the first generated track in an empty sequence", () => {
  const project = fixture();
  project.sequences[1]!.tracks = [];
  const operations = compileProjectToolCalls(project, [
    {
      name: "insert_source_range",
      arguments: { asset_id: "procedural", source_in_seconds: 0, source_out_seconds: 0.5, mode: "insert" },
    },
    {
      name: "insert_source_range",
      arguments: { asset_id: "procedural", source_in_seconds: 0.5, source_out_seconds: 1.5, mode: "insert" },
    },
  ]);
  const tracks = operations.flatMap((operation) => operation.type === "addTrack" ? [operation.track.id] : []);
  const inserts = operations.flatMap((operation) => operation.type === "insertOverwrite" ? [operation] : []);
  assert.equal(tracks.length, 1);
  assert.deepEqual(inserts.map(({ trackId }) => trackId), [tracks[0], tracks[0]]);
  assert.deepEqual(inserts.map(({ element }) => element.timelineRange.start), [secondsToTicks(0), secondsToTicks(0.5)]);
});

test("linked clips move and delete as one atomic edit plan", () => {
  const project = fixture();
  const active = project.sequences[1]!;
  active.tracks.push({
    id: "audio",
    name: "Audio",
    kind: "audio",
    order: 1,
    locked: false,
    muted: false,
    hidden: false,
    elements: [{
      id: "audio-clip",
      name: "Sync audio",
      kind: "audio",
      timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
      sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
      properties: {},
      keyframes: [],
    }],
  });
  active.linkGroups = [{ id: "av", elementIds: ["clip", "audio-clip"] }];

  const move = compileProjectToolCalls(project, [
    { name: "move_clip", arguments: { element_id: "clip", start_seconds: 4 } },
  ]);
  assert.deepEqual(move.map(({ type }) => type), [
    "deleteLinkGroup",
    "moveElement",
    "moveElement",
    "addLinkGroup",
  ]);

  const deletion = compileProjectToolCalls(project, [
    { name: "delete_clip", arguments: { element_id: "audio-clip" } },
  ]);
  assert.deepEqual(deletion.map(({ type }) => type), [
    "deleteLinkGroup",
    "deleteElement",
    "deleteElement",
  ]);
});

test("link and unlink tools reject ambiguous membership", () => {
  const project = fixture();
  project.sequences[1]!.tracks[0]!.elements.push({
    id: "clip-2",
    name: "Second clip",
    kind: "video",
    assetId: "procedural",
    timelineRange: { start: secondsToTicks(3), duration: secondsToTicks(2) },
    sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
    properties: {},
    keyframes: [],
  });
  const link = compileProjectToolCalls(project, [{
    name: "link_clips",
    arguments: { element_ids: ["clip", "clip-2"] },
  }]);
  assert.equal(link[0]?.type, "addLinkGroup");

  project.sequences[1]!.linkGroups = [{ id: "linked", elementIds: ["clip", "clip-2"] }];
  const unlink = compileProjectToolCalls(project, [{
    name: "unlink_clips",
    arguments: { element_id: "clip" },
  }]);
  assert.deepEqual(unlink, [{
    type: "deleteLinkGroup",
    sequenceId: "active",
    linkGroupId: "linked",
  }]);
  assert.throws(
    () => compileProjectToolCalls(project, [{
      name: "link_clips",
      arguments: { element_ids: ["clip", "clip-2"] },
    }]),
    /already belongs/,
  );
});

test("keyframe tools use absolute timeline time and preserve easing", () => {
  const project = fixture();
  project.sequences[1]!.tracks[0]!.elements[0]!.timelineRange.start = secondsToTicks(2);
  project.sequences[1]!.tracks[0]!.elements[0]!.keyframes = [{
    path: "transform.scale",
    keyframes: [{
      id: "scale-existing",
      at: secondsToTicks(1),
      value: 1,
      easing: "linear",
    }],
  }];

  const update = compileProjectToolCalls(project, [{
    name: "set_keyframe",
    arguments: {
      element_id: "clip",
      path: "transform.scale",
      at_timeline_seconds: 3,
      value: 1.2,
      easing: "easeInOut",
    },
  }]);
  assert.deepEqual(update, [{
    type: "updateKeyframe",
    elementId: "clip",
    path: "transform.scale",
    keyframe: {
      id: "scale-existing",
      at: secondsToTicks(1),
      value: 1.2,
      easing: "easeInOut",
    },
  }]);

  const deletion = compileProjectToolCalls(project, [{
    name: "delete_keyframe",
    arguments: {
      element_id: "clip",
      path: "transform.scale",
      at_timeline_seconds: 3,
    },
  }]);
  assert.deepEqual(deletion, [{
    type: "removeKeyframe",
    elementId: "clip",
    path: "transform.scale",
    keyframeId: "scale-existing",
  }]);
  assert.throws(
    () => compileProjectToolCalls(project, [{
      name: "set_keyframe",
      arguments: {
        element_id: "clip",
        path: "transform.opacity",
        at_timeline_seconds: 8,
        value: 2,
        easing: "linear",
      },
    }]),
    /inside the target clip|between 0 and 1/,
  );
});

test("set_keyframe defaults to linear and teaches every valid easing", () => {
  const operations = compileProjectToolCalls(fixture(), [{
    name: "set_keyframe",
    arguments: {
      element_id: "clip",
      path: "transform.scale",
      at_timeline_seconds: 1,
      value: 1.1,
    },
  }]);
  assert.equal(operations[0]?.type, "addKeyframe");
  if (operations[0]?.type === "addKeyframe") assert.equal(operations[0].keyframe.easing, "linear");
  assert.throws(
    () => compileProjectToolCalls(fixture(), [{
      name: "set_keyframe",
      arguments: {
        element_id: "clip",
        path: "transform.scale",
        at_timeline_seconds: 1,
        value: 1.1,
        easing: "spring",
      },
    }]),
    /Valid values: linear, easeIn, easeOut, easeInOut, hold/,
  );
});

test("freeze_frame keeps the clip head and freezes its final frame by default", () => {
  const project = fixture();
  const operations = compileProjectToolCalls(project, [{
    name: "freeze_frame",
    arguments: { element_id: "clip", hold_seconds: 1.25 },
  }]);
  assert.deepEqual(operations.map(({ type }) => type), ["splitElement", "replaceElement"]);
  const split = operations[0];
  const replacement = operations[1];
  assert.ok(split?.type === "splitElement" && replacement?.type === "replaceElement");
  assert.equal(split.elementId, "clip");
  assert.equal(Number(split.at), Number(secondsToTicks(2 - 1 / 30)));
  assert.equal(replacement.element.id, split.rightElementId);
  assert.equal(replacement.element.properties["playback.freeze"], true);
  assert.equal(replacement.element.properties["audio.muted"], true);
  assert.equal(replacement.element.timelineRange.duration, secondsToTicks(1.25));
  assert.equal(replacement.element.sourceRange?.start, secondsToTicks(2 - 1 / 30));

  const explicit = compileProjectToolCalls(project, [{
    name: "freeze_frame",
    arguments: { element_id: "clip", at_timeline_seconds: 1, hold_seconds: 0.5 },
  }]);
  assert.ok(explicit[0]?.type === "splitElement");
  if (explicit[0]?.type === "splitElement") assert.equal(explicit[0].at, secondsToTicks(1));
});

test("hold_last_frame emits one frozen-tail group with picture and audio fade keyframes", () => {
  const operations = compileProjectToolCalls(fixture(), [{
    name: "hold_last_frame",
    arguments: {
      element_id: "clip",
      hold_seconds: 2,
      fade_out_seconds: 0.7,
      audio_fade_out_seconds: 0.5,
    },
  }]);
  assert.deepEqual(operations.map(({ type }) => type), [
    "splitElement",
    "replaceElement",
    "addKeyframe",
    "addKeyframe",
    "addKeyframe",
    "addKeyframe",
  ]);
  const replacement = operations[1];
  assert.ok(replacement?.type === "replaceElement");
  assert.equal(replacement.element.timelineRange.duration, secondsToTicks(2));
  assert.equal(replacement.element.properties["audio.fadeOutSeconds"], 0.5);
  const keyframes = operations.filter((operation) => operation.type === "addKeyframe");
  assert.deepEqual(keyframes.map(({ path, keyframe }) => [path, keyframe.at, keyframe.value]), [
    ["transform.opacity", secondsToTicks(1.3), 1],
    ["transform.opacity", secondsToTicks(2), 0],
    ["audio.gainDb", secondsToTicks(1.5), 0],
    ["audio.gainDb", secondsToTicks(2), -60],
  ]);
  assert.equal(new Set(keyframes.map(({ keyframe }) => keyframe.id)).size, 4);
  assert.throws(
    () => compileProjectToolCalls(fixture(), [{
      name: "hold_last_frame",
      arguments: { element_id: "clip", hold_seconds: 1, fade_out_seconds: 1.1 },
    }]),
    /between 0 and hold_seconds/,
  );
});

test("hold_last_frame allocates fade ids after keyframes already used by graphics", () => {
  const project = fixture();
  project.sequences[1]!.tracks[0]!.elements[0]!.keyframes = [{
    path: "transform.scale",
    keyframes: [{ id: "keyframe-agent-1", at: secondsToTicks(0), value: 1, easing: "linear" }],
  }];
  const operations = compileProjectToolCalls(project, [{
    name: "hold_last_frame",
    arguments: { element_id: "clip", hold_seconds: 2, fade_out_seconds: 0.7, audio_fade_out_seconds: 0.5 },
  }]);
  const ids = operations.flatMap((operation) => operation.type === "addKeyframe" ? [operation.keyframe.id] : []);
  assert.equal(ids.includes("keyframe-agent-1"), false);
  assert.equal(new Set(ids).size, 4);
});

const transitionFixture = (): Project => {
  const project = fixture();
  const sequence = project.sequences[1]!;
  const outgoing = sequence.tracks[0]!.elements[0]!;
  project.assets[1]!.duration = secondsToTicks(4);
  outgoing.sourceRange = { start: secondsToTicks(1), duration: secondsToTicks(2) };
  project.assets.push({
    id: "incoming-asset",
    name: "Incoming",
    mediaType: "video",
    role: "original",
    duration: secondsToTicks(4),
    storage: [],
  });
  sequence.tracks[0]!.elements.push({
    id: "incoming",
    name: "Incoming",
    kind: "video",
    assetId: "incoming-asset",
    timelineRange: { start: secondsToTicks(2), duration: secondsToTicks(2) },
    sourceRange: { start: secondsToTicks(1), duration: secondsToTicks(2) },
    properties: {},
    keyframes: [],
  });
  return project;
};

test("apply_transition uses source handles before clamping speech-safe duration", () => {
  const evidence = {
    transcriptWordsForAsset: (assetId: string) => assetId === "procedural"
      ? [{ text: "out", startSeconds: 1.2, endSeconds: 2.9 }]
      : [{ text: "in", startSeconds: 1.1, endSeconds: 2.5 }],
  };
  const extended = compileProjectToolCallsPrepared(transitionFixture(), [{
    name: "apply_transition",
    arguments: {
      outgoing_element_id: "clip",
      incoming_element_id: "incoming",
      kind: "cross-dissolve",
      duration_seconds: 0.5,
    },
  }], evidence);
  assert.equal(extended.operations.length, 1);
  assert.deepEqual(extended.prepared, [{
    tool: "apply_transition",
    outgoingElementId: "clip",
    incomingElementId: "incoming",
    appliedDurationSeconds: 0.5,
    extendedOutgoingSeconds: 0.32,
    extendedIncomingSeconds: 0.32,
    clampedBy: [],
  }]);

  const clamped = compileProjectToolCallsPrepared(transitionFixture(), [{
    name: "apply_transition",
    arguments: {
      outgoing_element_id: "clip",
      incoming_element_id: "incoming",
      kind: "dip-to-black",
      duration_seconds: 0.5,
      fit: "speech",
      max_handle_seconds: 0.1,
    },
  }], evidence);
  assert.deepEqual(clamped.prepared[0], {
    tool: "apply_transition",
    outgoingElementId: "clip",
    incomingElementId: "incoming",
    appliedDurationSeconds: 0.28,
    extendedOutgoingSeconds: 0.1,
    extendedIncomingSeconds: 0.1,
    clampedBy: ["outgoing-speech", "incoming-speech"],
  });
});

test("add_air extends speech-safe handles, freezes a visual fallback and inserts measured room tone", () => {
  const extendProject = transitionFixture();
  const extended = compileProjectToolCallsPrepared(extendProject, [{
    name: "add_air",
    arguments: { at_cut_seconds: 2, seconds: 0.5, mode: "extend" },
  }]);
  assert.deepEqual(extended.prepared, [{
    tool: "add_air", atCutSeconds: 2, seconds: 0.5, mode: "extend",
    extendedOutgoingSeconds: 0.5, extendedIncomingSeconds: 0,
    freezeSeconds: 0, roomToneSeconds: 0, rippledBySeconds: 0.5,
  }]);
  const extendedTrack = extended.operations.find((operation) => operation.type === "replaceTrackElements");
  assert.ok(extendedTrack?.type === "replaceTrackElements");
  assert.equal(extendedTrack.elements.find(({ id }) => id === "clip")?.timelineRange.duration, secondsToTicks(2.5));
  assert.equal(extendedTrack.elements.find(({ id }) => id === "incoming")?.timelineRange.start, secondsToTicks(2.5));

  const frozen = compileProjectToolCallsPrepared(transitionFixture(), [{
    name: "add_air",
    arguments: { at_cut_seconds: 2, seconds: 0.4, mode: "freeze" },
  }]);
  assert.equal(frozen.prepared[0]?.tool, "add_air");
  assert.equal(frozen.prepared[0]?.mode, "freeze");
  const frozenTrack = frozen.operations.find((operation) => operation.type === "replaceTrackElements");
  assert.ok(frozenTrack?.type === "replaceTrackElements");
  const airFreeze = frozenTrack.elements.find(({ properties }) => properties["playback.freeze"] === true);
  assert.ok(airFreeze);
  assert.deepEqual(airFreeze.timelineRange, { start: secondsToTicks(2), duration: secondsToTicks(0.4) });
  assert.equal(frozenTrack.elements.find(({ id }) => id === "incoming")?.timelineRange.start, secondsToTicks(2.4));

  const roomTone = compileProjectToolCallsPrepared(transitionFixture(), [{
    name: "add_air",
    arguments: { at_cut_seconds: 2, seconds: 0.3, mode: "room-tone" },
  }], {
    audioAnalysisForAsset: () => ({ silenceRanges: [{ start: secondsToTicks(1.2), end: secondsToTicks(1.8) }] }),
  });
  assert.equal(roomTone.prepared[0]?.tool, "add_air");
  assert.equal(roomTone.prepared[0]?.mode, "room-tone");
  assert.deepEqual(roomTone.operations.map(({ type }) => type), ["replaceTrackElements", "addTrack", "insertElement"]);
  const room = roomTone.operations.find((operation) => operation.type === "insertElement");
  assert.ok(room?.type === "insertElement");
  assert.equal(room.element.properties["audio.loop"], true);
  assert.deepEqual(room.element.timelineRange, { start: secondsToTicks(2), duration: secondsToTicks(0.3) });
});

test("add_air auto respects transcript margins before falling back to a freeze", () => {
  const compiled = compileProjectToolCallsPrepared(transitionFixture(), [{
    name: "add_air",
    arguments: { at_cut_seconds: 2, seconds: 0.5 },
  }], {
    transcriptWordsForAsset: (assetId) => assetId === "procedural"
      ? [{ startSeconds: 3.1, endSeconds: 3.4 }]
      : [{ startSeconds: 0.7, endSeconds: 0.9 }],
  });
  assert.deepEqual(compiled.prepared[0], {
    tool: "add_air", atCutSeconds: 2, seconds: 0.5, mode: "freeze",
    extendedOutgoingSeconds: 0.1, extendedIncomingSeconds: 0.1,
    freezeSeconds: 0.3, roomToneSeconds: 0, rippledBySeconds: 0.5,
  });
});

test("shot evidence clamps transition, punch-in and graphic windows", () => {
  const transition = transitionFixture();
  const evidence = {
    shotChangesForAsset: (assetId: string) => assetId === "procedural"
      ? [{ atSourceSeconds: 2.8, score: 0.5 }]
      : [{ atSourceSeconds: 1.25, score: 0.6 }],
  };
  const snappedTransition = compileProjectToolCallsPrepared(transition, [{
    name: "apply_transition",
    arguments: {
      outgoing_element_id: "clip", incoming_element_id: "incoming",
      kind: "cross-dissolve", duration_seconds: 0.5, snap: "shot",
    },
  }], evidence);
  assert.deepEqual(snappedTransition.prepared[0], {
    tool: "apply_transition", outgoingElementId: "clip", incomingElementId: "incoming",
    appliedDurationSeconds: 0.2, extendedOutgoingSeconds: 0, extendedIncomingSeconds: 0,
    clampedBy: ["shot-change"], snappedFrom: 1.8, snappedTo: 2.2,
  });

  const project = fixture();
  project.assets.push({ id: "inter", name: "Inter-SemiBold.ttf", mediaType: "font", role: "original", storage: [] });
  const windowEvidence = { shotChangesForAsset: () => [{ atSourceSeconds: 1.2, score: 0.7 }] };
  const punch = compileProjectToolCallsPrepared(project, [{
    name: "punch_in",
    arguments: { element_id: "clip", factor: 1.2, at_timeline_seconds: 0.5, duration_seconds: 1, snap: "shot" },
  }], windowEvidence);
  assert.deepEqual(punch.prepared[0], { tool: "punch_in", elementId: "clip", snappedFrom: 0.5, snappedTo: 1.2 });
  const punchEnds = punch.operations.filter((operation) => operation.type === "addKeyframe")
    .map(({ keyframe }) => keyframe.at);
  assert.ok(punchEnds.includes(secondsToTicks(1.2)));

  const graphic = compileProjectToolCallsPrepared(project, [{
    name: "add_graphic",
    arguments: { template: "title-card/plain", at_seconds: 0.5, duration_seconds: 1.5, snap: "shot", slots: { title: "Chapter" } },
  }], windowEvidence);
  assert.equal(graphic.prepared[0]?.tool, "add_graphic");
  assert.equal(graphic.prepared[0]?.snappedFrom, 0.5);
  assert.equal(graphic.prepared[0]?.snappedTo, 1.2);
  const graphicElement = graphic.operations.find((operation) => operation.type === "insertElement");
  assert.ok(graphicElement?.type === "insertElement");
  assert.equal(graphicElement.element.timelineRange.duration, secondsToTicks(0.7));
});

test("punch_in authors scale and anchor-safe position keyframes and protects 1080p", () => {
  const project = fixture();
  project.assets[1]!.width = 3840;
  project.assets[1]!.height = 2160;
  const operations = compileProjectToolCalls(project, [{
    name: "punch_in",
    arguments: {
      element_id: "clip",
      factor: 1.25,
      at_timeline_seconds: 0.25,
      duration_seconds: 1.5,
      anchor: [0.6, 0.4],
      ease: "inOut",
    },
  }]);
  assert.deepEqual(operations.map((operation) => operation.type === "addKeyframe"
    ? [operation.path, operation.keyframe.at, operation.keyframe.value, operation.keyframe.easing]
    : operation.type), [
    ["transform.scale", secondsToTicks(0.25), 1, "easeInOut"],
    ["transform.scale", secondsToTicks(1.75), 1.25, "linear"],
    ["transform.position", secondsToTicks(0.25), [0.5, 0.5], "easeInOut"],
    ["transform.position", secondsToTicks(1.75), [0.475, 0.525], "linear"],
  ]);
  project.assets[1]!.width = 1920;
  project.assets[1]!.height = 1080;
  assert.throws(
    () => compileProjectToolCalls(project, [{
      name: "punch_in",
      arguments: { element_id: "clip", factor: 1.4, at_timeline_seconds: 0, duration_seconds: 1 },
    }]),
    /1080p or below at 1\.35× or less.*higher-resolution source/,
  );
});

test("add_graphic expands template layers with one group and remove_graphic deletes that group", () => {
  const project = fixture();
  project.assets.push(
    { id: "bricolage", name: "BricolageGrotesque.ttf", mediaType: "font", role: "original", storage: [] },
    { id: "inter", name: "Inter-SemiBold.ttf", mediaType: "font", role: "original", storage: [] },
    { id: "logo", name: "Mirror logo.png", mediaType: "image", role: "original", width: 512, height: 512, storage: [] },
  );
  const compiled = compileProjectToolCallsPrepared(project, [{
    name: "add_graphic",
    arguments: {
      template: "lower-third/documentary-01",
      at_seconds: 0.5,
      slots: {
        name: "Daniel Reed",
        role: "Founder",
      },
    },
  }]);
  const inserted = compiled.operations.filter((operation) => operation.type === "insertElement");
  assert.equal(inserted.length, 2);
  const groupIds = inserted.map(({ element }) => element.properties["group.id"]);
  assert.equal(new Set(groupIds).size, 1);
  assert.equal(inserted[0]!.element.properties["text.content"], "Daniel Reed");
  assert.equal(inserted[0]!.element.properties["style.fontSize"], 46);
  assert.equal(inserted[0]!.element.properties["style.boxOpacity"], 0.55);
  assert.equal(inserted[0]!.element.properties["style.boxColor"], "#000000");
  assert.equal(inserted[0]!.element.properties["style.boxPadding"], 20);
  assert.equal(inserted[0]!.element.properties["style.boxMinWidth"], 760);
  assert.equal(inserted[0]!.element.properties["style.boxHeight"], 128);
  assert.equal(inserted[0]!.element.properties["style.boxWidth"], undefined);
  assert.equal(inserted[0]!.element.properties["style.fontAssetId"], "bricolage");
  assert.equal(inserted[0]!.element.properties["style.fontFamily"], "Bricolage Grotesque");
  assert.equal(inserted[1]!.element.properties["style.fontSize"], 24);
  assert.equal(inserted[1]!.element.properties["style.color"], "#d6b46a");
  assert.equal(inserted[1]!.element.properties["style.trackingEm"], undefined);
  assert.equal(inserted[1]!.element.properties["text.content"], "F\u2009O\u2009U\u2009N\u2009D\u2009E\u2009R");
  assert.equal(inserted[1]!.element.properties["style.fontAssetId"], "inter");
  assert.deepEqual(inserted.map(({ element }) => [
    element.properties["group.template"],
    element.properties["group.slot"],
    element.properties["graphic.template"],
  ]), [
    ["lower-third/documentary-01", "name", "lower-third/documentary-01"],
    ["lower-third/documentary-01", "role", "lower-third/documentary-01"],
  ]);
  assert.deepEqual(inserted[0]!.element.keyframes[0]!.keyframes.map(({ at, value }) => [at, value]), [
    [secondsToTicks(0), 0],
    [secondsToTicks(0.7), 1],
    [secondsToTicks(3.3), 1],
    [secondsToTicks(4), 0],
  ]);
  const graphicTracks = compiled.operations.filter((operation) => operation.type === "addTrack");
  assert.equal(graphicTracks.length, 2);
  assert.ok(graphicTracks[1]!.track.order > graphicTracks[0]!.track.order, "the role must composite above the name box");
  const prepared = compiled.prepared[0];
  assert.ok(prepared?.tool === "add_graphic");

  const overridden = compileProjectToolCalls(project, [{
    name: "add_graphic",
    arguments: {
      template: "title-card/plain",
      at: 1,
      duration_seconds: 2,
      slots: { title: "Opening", fontAssetId: "bricolage" },
    },
  }]).find((operation) => operation.type === "insertElement");
  assert.ok(overridden?.type === "insertElement");
  assert.equal(overridden.element.properties["style.fontAssetId"], "bricolage");
  assert.equal(overridden.element.properties["style.fontFamily"], "Bricolage Grotesque");

  const endCard = compileProjectToolCalls(project, [{
    name: "add_graphic",
    arguments: {
      template: "end-card/logo-line",
      at_seconds: 0,
      slots: { logoAssetId: "logo", line: "A Mirror film", url: "mirror.example" },
    },
  }]).filter((operation) => operation.type === "insertElement");
  assert.equal(endCard.length, 3);
  assert.deepEqual(endCard.map(({ element }) => element.timelineRange.duration), [
    secondsToTicks(5), secondsToTicks(5), secondsToTicks(5),
  ]);
  assert.deepEqual(endCard.map(({ element }) => [element.properties["group.template"], element.properties["group.slot"]]), [
    ["end-card/logo-line", "logo_asset_id"],
    ["end-card/logo-line", "line"],
    ["end-card/logo-line", "url"],
  ]);

  project.sequences[1]!.tracks.push({
    id: "graphics",
    name: "Graphics",
    kind: "text",
    order: 2,
    locked: false,
    muted: false,
    hidden: false,
    elements: inserted.map(({ element }) => element),
  });
  const readded = compileProjectToolCallsPrepared(project, [{
    name: "add_graphic",
    arguments: {
      template: "lower-third/documentary-01",
      at_seconds: 1,
      slots: { name: "Frank Whitmore", role: "Founder" },
    },
  }]);
  assert.equal(readded.prepared[0]?.tool, "add_graphic");
  assert.equal(readded.prepared[0]?.groupId, "graphic-group-2");

  const removed = compileProjectToolCalls(project, [{
    name: "remove_graphic",
    arguments: { group_id: prepared.groupId },
  }]);
  assert.deepEqual(removed.map(({ type }) => type), ["deleteElement", "deleteElement"]);
  const noMatch = fixture();
  noMatch.assets.push({ id: "comic", name: "ComicSans.ttf", mediaType: "font", role: "original", storage: [] });
  assert.throws(
    () => compileProjectToolCalls(noMatch, [{
      name: "add_graphic",
      arguments: {
        template: "title-card/plain",
        at: 0,
        slots: { title: "Opening" },
      },
    }]),
    /matching Inter, Space Grotesk, Bricolage Grotesque.*comic \(ComicSans\.ttf\)/,
  );

  const noFonts = fixture();
  assert.throws(
    () => compileProjectToolCalls(noFonts, [{
      name: "add_graphic",
      arguments: {
        template: "lower-third/documentary-01",
        at_seconds: 0,
        slots: { name: "Daniel Vega", role: "Associate" },
      },
    }]),
    (error: unknown) => error instanceof Error
      && /nameFontAssetId/.test(error.message)
      && /roleFontAssetId/.test(error.message)
      && /Fix all missing or invalid dependencies/.test(error.message),
  );
});

test("assemble_first_cut defaults a title slot to the Mirror documentary title template", () => {
  const project = fixture();
  project.assets.push({ id: "bricolage", name: "BricolageGrotesque.ttf", mediaType: "font", role: "original", storage: [] });
  project.sequences[1]!.tracks[0]!.elements = [];
  const compiled = compileProjectToolCallsPrepared(project, [{
    name: "assemble_first_cut",
    arguments: {
      rows: [{ asset_id: "procedural", timeline: "0–2", beat: "cut" }],
      graphics: [{ at_seconds: 0.5, duration_seconds: 1, slots: { title: "His son" } }],
      transitions: "none",
    },
  }]);
  const title = compiled.operations.find((operation) => operation.type === "insertElement" && operation.element.kind === "text");
  assert.ok(title?.type === "insertElement");
  assert.equal(title.element.properties["graphic.template"], "title-card/documentary-01");
  assert.equal(title.element.properties["style.fontSize"], 46);
  assert.equal(title.element.properties["text.align"], "left");
  assert.equal(title.element.properties["style.boxOpacity"], 0.55);
  assert.deepEqual(title.element.properties["transform.position"], [0.075, 0.79]);
});

test("region blur is reversible project state and tracking stays inside source bounds", () => {
  const project = fixture();
  const operations = compileProjectToolCalls(project, [{
    name: "apply_region_blur",
    arguments: {
      element_id: "clip",
      x: 0.1,
      y: 0.2,
      width: 0.2,
      height: 0.3,
      strength: 20,
    },
  }]);
  assert.deepEqual(operations.map(({ type }) => type), [
    "setProperty",
    "setProperty",
    "setProperty",
    "setProperty",
    "setProperty",
  ]);
  assert.deepEqual(operations.map((operation) => operation.type === "setProperty" ? [operation.path, operation.value] : undefined), [
    ["effect.regionMask.id", "atelier.region.blur"],
    ["effect.regionMask.version", 1],
    ["mask.region.rect", [0.1, 0.2, 0.2, 0.3]],
    ["mask.region.center", [0.2, 0.35]],
    ["mask.region.strength", 20],
  ]);

  const element = project.sequences[1]!.tracks[0]!.elements[0]!;
  element.properties = {
    "effect.regionMask.id": "atelier.region.blur",
    "effect.regionMask.version": 1,
    "mask.region.rect": [0.1, 0.2, 0.2, 0.3],
    "mask.region.center": [0.2, 0.35],
    "mask.region.strength": 20,
  };
  const tracked = compileProjectToolCalls(project, [{
    name: "set_keyframe",
    arguments: {
      element_id: "clip",
      path: "mask.region.center",
      at_timeline_seconds: 1,
      value: [0.7, 0.5],
      easing: "linear",
    },
  }]);
  assert.equal(tracked[0]?.type, "addKeyframe");
  assert.throws(
    () => compileProjectToolCalls(project, [{
      name: "set_keyframe",
      arguments: {
        element_id: "clip",
        path: "mask.region.center",
        at_timeline_seconds: 1,
        value: [0.02, 0.5],
        easing: "linear",
      },
    }]),
    /complete blur rectangle inside/i,
  );

  element.keyframes = [{
    path: "mask.region.center",
    keyframes: [{ id: "mask-track", at: secondsToTicks(1), value: [0.7, 0.5], easing: "linear" }],
  }];
  const cleared = compileProjectToolCalls(project, [{
    name: "clear_region_mask",
    arguments: { element_id: "clip" },
  }]);
  assert.equal(cleared.filter(({ type }) => type === "removeProperty").length, 5);
  assert.deepEqual(cleared.at(-1), {
    type: "removeKeyframe",
    elementId: "clip",
    path: "mask.region.center",
    keyframeId: "mask-track",
  });
});

test("adjust_color cannot hide a no-op behind an earlier batch operation", () => {
  assert.throws(
    () => compileProjectToolCalls(fixture(), [
      { name: "set_property", arguments: { element_id: "clip", path: "transform.opacity", value: 0.5 } },
      { name: "adjust_color", arguments: { element_id: "clip" } },
    ]),
    /needs at least one/i,
  );
});

test("match_clip_color authors measured render properties and reports reduced distance", () => {
  const project = fixture();
  project.assets.push({
    id: "reference-asset", name: "Reference", mediaType: "video", role: "original",
    duration: secondsToTicks(2), storage: [],
  });
  project.sequences[1]!.tracks[0]!.elements.push({
    id: "reference", name: "Reference", kind: "video", assetId: "reference-asset",
    timelineRange: { start: secondsToTicks(2), duration: secondsToTicks(2) },
    sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
    properties: {}, keyframes: [],
  });
  const measurement = (assetId: string) => ({
    id: `color-${assetId}`, version: 1, projectId: project.id, assetId,
    provider: "ffmpeg-yuv444p-color-v1" as const, createdAt: 1,
    sampleCount: 6 as const, sampledAtSeconds: [0.1, 0.3, 0.5, 0.7, 0.9, 1.1],
    ...(assetId === "procedural"
      ? { meanY: 0.3, percentile10Y: 0.2, percentile90Y: 0.4, meanCbOffset: 0.06, meanCrOffset: -0.05, saturation: 0.1 }
      : { meanY: 0.4, percentile10Y: 0.3, percentile90Y: 0.5, meanCbOffset: 0.01, meanCrOffset: -0.01, saturation: 0.12 }),
  });
  const compiled = compileProjectToolCallsPrepared(project, [{
    name: "match_clip_color",
    arguments: { target_element_id: "clip", reference_element_id: "reference" },
  }], { colorAnalysisForAsset: measurement });
  const property = (path: string) => compiled.operations.find((operation) =>
    operation.type === "setProperty" && operation.path === path);
  assert.deepEqual(property("color.exposure"), {
    type: "setProperty", elementId: "clip", path: "color.exposure", value: 0.08,
  });
  assert.equal(property("color.temperatureShift")?.type, "setProperty");
  assert.equal(property("color.tintShift")?.type, "setProperty");
  assert.equal(property("color.saturation")?.type, "setProperty");
  const prepared = compiled.prepared[0];
  assert.ok(prepared?.tool === "match_clip_color");
  assert.equal(prepared.strength, 0.8);
  assert.ok(prepared.distanceBefore > 0.1);
  assert.ok(prepared.distanceAfter < 0.03);
  assert.ok(prepared.distanceAfter < prepared.distanceBefore);
});

test("match_clip_color requires stored measurements and validates strength", () => {
  const project = fixture();
  project.assets.push({ id: "reference-asset", name: "Reference", mediaType: "image", role: "original", storage: [] });
  project.sequences[1]!.tracks[0]!.elements.push({
    id: "reference", name: "Reference", kind: "image", assetId: "reference-asset",
    timelineRange: { start: secondsToTicks(2), duration: secondsToTicks(1) },
    properties: {}, keyframes: [],
  });
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "match_clip_color", arguments: { target_element_id: "clip", reference_element_id: "reference" },
  }]), /stored six-frame color measurements/i);
  assert.throws(() => compileProjectToolCalls(project, [{
    name: "match_clip_color", arguments: { target_element_id: "clip", reference_element_id: "reference", strength: 1.1 },
  }], { colorAnalysisForAsset: () => undefined }), /between 0 and 1/);
});

test("apply_look authors one project-level look consistently across visual clips", () => {
  const project = fixture();
  project.sequences[1]!.tracks[0]!.elements.push({
    id: "still", name: "Still", kind: "image", assetId: "logo",
    timelineRange: { start: secondsToTicks(2), duration: secondsToTicks(1) },
    properties: {}, keyframes: [],
  });
  const compiled = compileProjectToolCallsPrepared(project, [{
    name: "apply_look", arguments: { look: "documentary-warm", strength: 0.65 },
  }]);
  assert.equal(compiled.operations.length, 4);
  assert.deepEqual(compiled.operations.flatMap((operation) =>
    operation.type === "setProperty" && operation.path === "plan.look" ? [[operation.elementId, operation.value]] : []), [
      ["clip", "documentary-warm"], ["still", "documentary-warm"],
    ]);
  assert.deepEqual(compiled.prepared[0], {
    tool: "apply_look", look: "documentary-warm", strength: 0.65, elementIds: ["clip", "still"],
  });
});

test("degraded procedural assets cannot enter through replacement tools", () => {
  const result = enforceProtectedAssetPolicy({
    calls: [{ name: "replace_clip_media", arguments: { element_id: "clip", asset_id: "procedural" } }],
    preserveFullAssetIds: new Set(),
    proceduralAssetIds: new Set(["procedural"]),
  });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0]?.reason ?? "", /degraded procedural fallback/i);
});

test("create_multicam_cut compiles seconds into a real pre-aligned program cut", () => {
  const project = fixture();
  project.assets.find(({ id }) => id === "procedural")!.channels = 2;
  project.assets.push({
    id: "angle-b",
    name: "Angle B",
    mediaType: "video",
    role: "original",
    duration: secondsToTicks(2),
    channels: 2,
    storage: [],
  });
  project.sequences[1]!.tracks.push({
    id: "video-b",
    name: "Angle B",
    kind: "video",
    order: 1,
    locked: false,
    muted: false,
    hidden: false,
    elements: [{
      id: "clip-b",
      name: "Angle B",
      kind: "video",
      assetId: "angle-b",
      timelineRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
      sourceRange: { start: secondsToTicks(0), duration: secondsToTicks(2) },
      properties: {},
      keyframes: [],
    }],
  });
  const operations = compileProjectToolCalls(project, [{
    name: "create_multicam_cut",
    arguments: {
      group_id: "interview",
      angles: [
        { angle_id: "wide", element_id: "clip" },
        { angle_id: "close", element_id: "clip-b" },
      ],
      switches: [
        { at_seconds: 0, angle_id: "wide" },
        { at_seconds: 1, angle_id: "close" },
      ],
      audio_angle_id: "wide",
    },
  }]);
  assert.deepEqual(operations.map(({ type }) => type), ["replaceElement", "replaceElement", "addTrack", "addTrack"]);
  const video = operations[2];
  assert.ok(video?.type === "addTrack");
  assert.deepEqual(video.track.elements.map(({ timelineRange }) => timelineRange), [
    { start: secondsToTicks(0), duration: secondsToTicks(1) },
    { start: secondsToTicks(1), duration: secondsToTicks(1) },
  ]);
});

test("a transition between untranscribed clips is fitted to time instead of refused", () => {
  // The defect: Atte asked for fit:"speech" on two generated clips nobody had
  // transcribed, the tool threw "Transcribe it first", and Atte never retried
  // without the flag — so the creator's fade was never applied.
  const compiled = compileProjectToolCallsPrepared(transitionFixture(), [{
    name: "apply_transition",
    arguments: {
      outgoing_element_id: "clip",
      incoming_element_id: "incoming",
      kind: "cross-dissolve",
      duration_seconds: 0.5,
      fit: "speech",
    },
  }], {});
  assert.ok(compiled.operations.length > 0);
  assert.deepEqual(compiled.prepared[0], {
    tool: "apply_transition",
    outgoingElementId: "clip",
    incomingElementId: "incoming",
    appliedDurationSeconds: 0.5,
    extendedOutgoingSeconds: 0,
    extendedIncomingSeconds: 0,
    clampedBy: [],
    fitFallback: "time",
  });
});
