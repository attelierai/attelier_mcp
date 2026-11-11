import assert from "node:assert/strict";
import test from "node:test";
import { secondsToTicks, type Asset } from "@attelier/project-schema";
import type { AudioAnalysisArtifact } from "@attelier/analysis-schema";
import {
  assertMusicAssetPublishable,
  searchRightsClearedMusic,
  suggestMusicMoments,
  type MusicLibraryAsset,
} from "./music-workflow.js";

const candidate = (
  id: string,
  rights: Record<string, unknown>,
  settings: Record<string, unknown> = {},
): MusicLibraryAsset => ({
  id,
  name: `${id} cinematic music`,
  kind: "audio",
  durationSeconds: 90,
  createdAt: 1,
  provenance: { rights, settings },
});

test("music search returns only rights-cleared assets for the requested use", () => {
  const results = searchRightsClearedMusic([
    candidate("cleared", { license: "licensed-master", publishable: true, commercial: true, platforms: ["youtube"] }, { mood: "dark", bpm: 92 }),
    candidate("reference", { license: "reference-only", publishable: false }),
    candidate("noncommercial", { license: "cc-by-nc", publishable: true, commercial: false }),
    candidate("wrong-platform", { license: "platform-license", publishable: true, commercial: true, platforms: ["tiktok"] }),
  ], "dark cinematic", { platform: "youtube", commercial: true });

  assert.deepEqual(results.map(({ assetId }) => assetId), ["cleared"]);
  assert.equal(results[0]?.bpm, 92);
});

test("music moment suggestions align preview windows to measured beats", () => {
  const artifact: AudioAnalysisArtifact = {
    id: "analysis-1",
    version: 1,
    projectId: "project-1",
    assetId: "music-1",
    provider: "ffmpeg",
    createdAt: 1,
    sampleRate: 48_000,
    durationSeconds: 100,
    peakDbfs: -1,
    dynamicRangeDb: 12,
    clippingSamples: 0,
    silenceRanges: [],
    beats: [3, 34, 62].map(secondsToTicks),
  };

  const moments = suggestMusicMoments(artifact, 12);
  assert.deepEqual(moments.map(({ sourceStartSeconds }) => sourceStartSeconds), [3, 34, 62]);
  assert.ok(moments.every(({ beatAligned, requiresCreatorPreview }) => beatAligned && requiresCreatorPreview));
});

test("publishability check fails closed without an explicit usable licence", () => {
  const base: Pick<Asset, "id" | "mediaType" | "provenance"> = { id: "music-1", mediaType: "audio" };
  assert.throws(() => assertMusicAssetPublishable(base), /not cleared for publication/);
  const licensed: Pick<Asset, "id" | "mediaType" | "provenance"> = {
    ...base,
    provenance: {
      origin: "uploaded",
      provider: "user",
      createdAt: 1,
      rights: { license: "licensed-master", publishable: true, commercial: true, platforms: ["youtube"] },
    } as NonNullable<Asset["provenance"]>,
  };
  assert.doesNotThrow(() => assertMusicAssetPublishable(licensed, { platform: "youtube", commercial: true }));
  assert.throws(() => assertMusicAssetPublishable(licensed, { platform: "tiktok", commercial: true }), /not licensed for tiktok/);
});

test("music search trusts an explicit music category instead of filename heuristics", () => {
  const results = searchRightsClearedMusic([
    {
      id: "midnight",
      name: "Midnight",
      kind: "audio",
      durationSeconds: 45,
      createdAt: 1,
      provenance: {
        rights: { license: "Self-owned", publishable: true, commercial: true },
        settings: { mediaCategory: "music", genre: "hip-hop", mood: "dark", bpm: 92, instrumental: true },
      },
    },
  ], "dark hip-hop", { commercial: true, instrumental: true });
  assert.equal(results[0]?.assetId, "midnight");
  assert.equal(results[0]?.bpm, 92);
});
