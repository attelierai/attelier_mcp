import { deepStrictEqual, equal, throws } from "node:assert/strict";
import test from "node:test";
import { mapPublicEditArguments } from "./compile-edit-boundary.js";
import { PublicToolValidationError } from "./public-boundary.js";

test("compile_edit maps camelCase arguments to the internal snake_case catalog", () => {
  deepStrictEqual(mapPublicEditArguments("trim_clip", { elementId: "clip-1", durationSeconds: 2.5, fromStart: true }), {
    element_id: "clip-1", duration_seconds: 2.5, from_start: true,
  });
});

test("compile_edit keeps public seconds for the tick-authoritative compiler", () => {
  deepStrictEqual(mapPublicEditArguments("slip_clip", { elementId: "clip-1", offsetSeconds: 0.5 }), {
    element_id: "clip-1", offset_seconds: 0.5,
  });
});

test("compile_edit accepts numeric and rational frame rates", () => {
  equal(mapPublicEditArguments("set_sequence_frame_rate", { frameRate: 24 }).frame_rate, 24);
  equal(mapPublicEditArguments("set_sequence_frame_rate", { frameRate: { numerator: 30_000, denominator: 1_001 } }).frame_rate, 30_000 / 1_001);
});

test("new edit recipes map camelCase fields and nested graphic slots", () => {
  deepStrictEqual(mapPublicEditArguments("assemble_first_cut", {
    rows: [{ timeline: "0.00–4.00", clip: "clip 4 · 0.5–4.5", beat: "dissolve 0.4 out" }],
    transitions: "fit-speech",
    graphics: [{
      template: "lower-third/documentary-01",
      atSeconds: 0.5,
      durationSeconds: 2,
      slots: { name: "Frank", roleFontAssetId: "font-role" },
    }],
    holdLastFrameSeconds: 2,
    fadeOutSeconds: 0.7,
  }), {
    rows: [{ timeline: "0.00–4.00", clip: "clip 4 · 0.5–4.5", beat: "dissolve 0.4 out" }],
    transitions: "fit-speech",
    graphics: [{
      template: "lower-third/documentary-01",
      at_seconds: 0.5,
      duration_seconds: 2,
      slots: { name: "Frank", role_font_asset_id: "font-role" },
    }],
    hold_last_frame_seconds: 2,
    fade_out_seconds: 0.7,
  });
  deepStrictEqual(mapPublicEditArguments("hold_last_frame", {
    elementId: "clip-1",
    holdSeconds: 2,
    fadeOutSeconds: 0.7,
    audioFadeOutSeconds: 0.5,
  }), {
    element_id: "clip-1",
    hold_seconds: 2,
    fade_out_seconds: 0.7,
    audio_fade_out_seconds: 0.5,
  });
  deepStrictEqual(mapPublicEditArguments("freeze_frame", {
    elementId: "clip-1",
    holdSeconds: 1,
    atTimelineSeconds: 3.5,
  }), {
    element_id: "clip-1",
    hold_seconds: 1,
    at_timeline_seconds: 3.5,
  });
  deepStrictEqual(mapPublicEditArguments("apply_transition", {
    outgoingElementId: "a",
    incomingElementId: "b",
    kind: "cross-dissolve",
    durationSeconds: 0.5,
    fit: "speech",
    maxHandleSeconds: 0.3,
    snap: "shot",
  }), {
    outgoing_element_id: "a",
    incoming_element_id: "b",
    kind: "cross-dissolve",
    duration_seconds: 0.5,
    fit: "speech",
    max_handle_seconds: 0.3,
    snap: "shot",
  });
  deepStrictEqual(mapPublicEditArguments("punch_in", {
    elementId: "clip-1",
    factor: 1.2,
    atTimelineSeconds: 1,
    durationSeconds: 2,
    anchor: [0.5, 0.4],
    ease: "inOut",
    snap: "shot",
  }), {
    element_id: "clip-1",
    factor: 1.2,
    at_timeline_seconds: 1,
    duration_seconds: 2,
    anchor: [0.5, 0.4],
    ease: "inOut",
    snap: "shot",
  });
  deepStrictEqual(mapPublicEditArguments("add_graphic", {
    template: "lower-third/documentary-01",
    atSeconds: 2,
    slots: { name: "Daniel", nameFontAssetId: "font-a", roleFontAssetId: "font-b" },
    snap: "shot",
  }), {
    template: "lower-third/documentary-01",
    at_seconds: 2,
    slots: { name: "Daniel", name_font_asset_id: "font-a", role_font_asset_id: "font-b" },
    snap: "shot",
  });
  deepStrictEqual(mapPublicEditArguments("add_air", {
    atCutSeconds: 4,
    seconds: 0.25,
    mode: "auto",
  }), {
    at_cut_seconds: 4,
    seconds: 0.25,
    mode: "auto",
  });
  deepStrictEqual(mapPublicEditArguments("add_graphic", {
    template: "lower-third/documentary-01",
    at: 3,
    slots: { name: "Legacy", name_font_asset_id: "font-a", role_font_asset_id: "font-b" },
  }), {
    template: "lower-third/documentary-01",
    at_seconds: 3,
    slots: { name: "Legacy", name_font_asset_id: "font-a", role_font_asset_id: "font-b" },
  });
  throws(() => mapPublicEditArguments("add_graphic", {
    template: "title-card/plain", atSeconds: 1, at: 2, slots: { title: "Conflict" },
  }), /duplicates another value/);
  deepStrictEqual(mapPublicEditArguments("remove_graphic", { groupId: "graphic-1" }), {
    group_id: "graphic-1",
  });
  deepStrictEqual(mapPublicEditArguments("place_music", {
    assetId: "music-1",
    atSeconds: 1,
    endSeconds: 9,
    duckUnderDialogue: true,
    duckDepthLu: 6,
    duckAttackMs: 80,
    duckReleaseMs: 300,
  }), {
    asset_id: "music-1",
    at_seconds: 1,
    end_seconds: 9,
    duck_under_dialogue: true,
    duck_depth_lu: 6,
    duck_attack_ms: 80,
    duck_release_ms: 300,
  });
  deepStrictEqual(mapPublicEditArguments("fill_room_tone", {
    fromSeconds: 4,
    toSeconds: 7,
    sourceElementId: "clip-a",
    gainDb: -28,
  }), {
    from_seconds: 4,
    to_seconds: 7,
    source_element_id: "clip-a",
    gain_db: -28,
  });
});

test("compile_edit accepts public match_clip_color arguments", () => {
  deepStrictEqual(mapPublicEditArguments("match_clip_color", {
    targetElementId: "clip-a",
    referenceElementId: "clip-b",
    strength: 0.8,
  }), {
    target_element_id: "clip-a",
    reference_element_id: "clip-b",
    strength: 0.8,
  });
});

test("compile_edit accepts public apply_look arguments", () => {
  deepStrictEqual(mapPublicEditArguments("apply_look", {
    look: "clean-neutral",
    strength: 0.5,
  }), {
    look: "clean-neutral",
    strength: 0.5,
  });
});

test("workspace and project asset ids stay explicit at the public edit boundary", () => {
  deepStrictEqual(mapPublicEditArguments("prepare_workspace_asset_import", { workspaceAssetId: "workspace-asset-1" }), {
    workspaceAssetId: "workspace-asset-1",
  });
  deepStrictEqual(mapPublicEditArguments("prepare_workspace_asset_import", { workspaceAssetId: "version-2", replaceAssetId: "library:version-1" }), {
    workspaceAssetId: "version-2",
    replaceAssetId: "library:version-1",
  });
  deepStrictEqual(mapPublicEditArguments("prepare_project_asset_placement", { workspaceAssetId: "workspace-asset-1", startSeconds: 2 }), {
    workspaceAssetId: "workspace-asset-1",
    startSeconds: 2,
  });
});

test("compile_edit unknown keys teach the valid boundary shape", () => {
  throws(
    () => mapPublicEditArguments("assemble_first_cut", { rows: [], hold_last_frame_seconds: 2 }),
    /Valid keys: rows, transitions, graphics, holdLastFrameSeconds, fadeOutSeconds/,
  );
  throws(
    () => mapPublicEditArguments("trim_clip", { element_id: "clip-1" }),
    (error: unknown) => error instanceof PublicToolValidationError
      && error.detail.code === "UNKNOWN_FIELD"
      && error.detail.field.includes("trim_clip")
      && Array.isArray(error.detail.validValues)
      && error.detail.example !== undefined,
  );

  throws(
    () => mapPublicEditArguments("ripple_trim_clip", { elementId: "clip-1", edge: "start", offsetFrames: 12 }),
    (error: unknown) => error instanceof PublicToolValidationError
      && error.detail.code === "UNKNOWN_FIELD"
      && error.detail.validValues?.includes("offsetSeconds") === true
      && error.detail.validValues?.includes("offsetFrames") === false
      && /Valid keys: elementId, edge, offsetSeconds\./.test(error.message)
      && !/Valid keys:.*offsetFrames/.test(error.message),
  );
});
