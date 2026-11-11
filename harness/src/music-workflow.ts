import type { AudioAnalysisArtifact } from "@attelier/analysis-schema";
import { ticksToSeconds, type Asset } from "@attelier/project-schema";

export type MusicUseContext = {
  platform?: string;
  commercial?: boolean;
};

export type MusicLibraryAsset = {
  id: string;
  name: string;
  kind: string;
  durationSeconds?: number;
  createdAt: number;
  provenance?: Record<string, unknown>;
};

export type RightsClearedMusicCandidate = {
  assetId: string;
  name: string;
  durationSeconds?: number;
  license: string;
  licenseProvider?: string;
  licenseId?: string;
  platforms: string[];
  attribution?: string;
  expiresAt?: number;
  genre?: string;
  mood?: string;
  bpm?: number;
  instrumental?: boolean;
  score: number;
};

export type MusicLicensingRoute = {
  provider: "youtube-creator-music" | "lickd" | "direct-clearance";
  label: string;
  url: string;
  availability: "requires_authenticated_check" | "rights_holder_clearance";
  note: string;
};

export type MusicMoment = {
  id: "opening" | "middle" | "late";
  label: string;
  sourceStartSeconds: number;
  durationSeconds: number;
  beatAligned: boolean;
  evidence: string[];
  requiresCreatorPreview: true;
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const words = (value: string): string[] =>
  value.toLocaleLowerCase().split(/[^a-z0-9áéíóúñ]+/i).filter((word) => word.length > 2);

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim().toLocaleLowerCase()] : [])
    : [];

const timestamp = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Search only audio that already carries an explicit publishable rights record. */
export const searchRightsClearedMusic = (
  assets: readonly MusicLibraryAsset[],
  query: string,
  context: MusicUseContext & { instrumental?: boolean; limit?: number; now?: number } = {},
): RightsClearedMusicCandidate[] => {
  const queryWords = words(query);
  const requestedPlatform = context.platform?.trim().toLocaleLowerCase();
  const now = context.now ?? Date.now();
  return assets.flatMap((asset) => {
    if (asset.kind !== "audio") return [];
    const provenance = record(asset.provenance) ?? {};
    const rights = record(provenance.rights);
    const settings = record(provenance.settings) ?? {};
    const license = typeof rights?.license === "string" ? rights.license.trim() : "";
    const publishable = rights?.publishable === true;
    const commercial = rights?.commercial !== false;
    const expiresAt = timestamp(rights?.expiresAt);
    const platforms = strings(rights?.platforms);
    if (!license || !publishable || (context.commercial !== false && !commercial)) return [];
    if (expiresAt !== undefined && expiresAt <= now) return [];
    if (requestedPlatform && platforms.length > 0 && !platforms.includes(requestedPlatform) && !platforms.includes("all")) return [];
    const genre = typeof settings.genre === "string" ? settings.genre : undefined;
    const mood = typeof settings.mood === "string" ? settings.mood : undefined;
    const bpm = typeof settings.bpm === "number" && Number.isFinite(settings.bpm) ? settings.bpm : undefined;
    const instrumental = typeof settings.instrumental === "boolean" ? settings.instrumental : undefined;
    const mediaCategory = typeof settings.mediaCategory === "string" ? settings.mediaCategory : undefined;
    if (context.instrumental !== undefined && instrumental !== undefined && instrumental !== context.instrumental) return [];
    const prompt = typeof provenance.prompt === "string" ? provenance.prompt : "";
    const haystack = `${asset.name} ${prompt} ${genre ?? ""} ${mood ?? ""}`.toLocaleLowerCase();
    const musicLike = mediaCategory === "music" || /music|song|track|score|soundtrack|bed|instrumental|ambient|cinematic|electronic|acoustic|piano|rock|pop|jazz|hip.?hop|m[uú]sica|canci[oó]n|pista/i.test(haystack);
    const voiceOrSfx = /voice|speech|narrat|voiceover|dialog|sound effect|locuci[oó]n|narraci[oó]n|efecto/i.test(haystack);
    if (!musicLike || voiceOrSfx) return [];
    const matches = queryWords.filter((word) => haystack.includes(word)).length;
    if (queryWords.length > 0 && matches === 0) return [];
    const score = matches * 10 + (instrumental === context.instrumental ? 2 : 0) + (requestedPlatform && platforms.includes(requestedPlatform) ? 2 : 0);
    return [{
      assetId: asset.id,
      name: asset.name,
      ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds }),
      license,
      ...(typeof rights?.provider === "string" ? { licenseProvider: rights.provider } : {}),
      ...(typeof rights?.licenseId === "string" ? { licenseId: rights.licenseId } : {}),
      platforms,
      ...(typeof rights?.attribution === "string" ? { attribution: rights.attribution } : {}),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(genre ? { genre } : {}),
      ...(mood ? { mood } : {}),
      ...(bpm === undefined ? {} : { bpm }),
      ...(instrumental === undefined ? {} : { instrumental }),
      score,
    }];
  }).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, Math.max(1, Math.min(20, context.limit ?? 6)));
};

/** External catalogs are discovery routes only; availability and price are never invented. */
export const licensingRoutesForMusic = (query: string): MusicLicensingRoute[] => {
  return [
    {
      provider: "youtube-creator-music",
      label: "YouTube Creator Music",
      url: "https://studio.youtube.com/",
      availability: "requires_authenticated_check",
      note: `Search “${query.trim()}” inside the publishing channel's authenticated Creator Music catalog; access is account/region dependent, and the exact video, territory and use terms must be verified.`,
    },
    {
      provider: "lickd",
      label: "Lickd",
      url: "https://app.lickd.co/search",
      availability: "requires_authenticated_check",
      note: "Verify the exact recording, channel, platforms, branded-content restrictions and one-video terms before purchase.",
    },
    {
      provider: "direct-clearance",
      label: "Direct sync + master clearance",
      url: "https://support.easysong.com/hc/en-us/articles/11674300791699-Do-I-Need-a-Synchronization-License",
      availability: "rights_holder_clearance",
      note: "Use when no pre-cleared catalog offers the exact recording; both composition sync and master-use rights may be required.",
    },
  ];
};

const insideSilence = (artifact: AudioAnalysisArtifact, seconds: number): boolean =>
  artifact.silenceRanges.some((range) => seconds >= ticksToSeconds(range.start) && seconds < ticksToSeconds(range.end));

const alignedStart = (
  artifact: AudioAnalysisArtifact,
  target: number,
  maximumStart: number,
): { seconds: number; beatAligned: boolean } => {
  const beats = artifact.beats.map(ticksToSeconds).filter((beat) => beat >= 0 && beat <= maximumStart && !insideSilence(artifact, beat));
  if (beats.length === 0) return { seconds: Math.max(0, Math.min(maximumStart, target)), beatAligned: false };
  const closest = beats.reduce((best, beat) => Math.abs(beat - target) < Math.abs(best - target) ? beat : best, beats[0]!);
  return { seconds: closest, beatAligned: true };
};

/** Produce evidence-based preview windows, not a claim that an algorithm knows the creator's favourite part. */
export const suggestMusicMoments = (
  artifact: AudioAnalysisArtifact,
  requestedDurationSeconds = 12,
): MusicMoment[] => {
  const durationSeconds = Math.max(2, Math.min(30, requestedDurationSeconds));
  if (!Number.isFinite(artifact.durationSeconds) || artifact.durationSeconds < durationSeconds) {
    throw new Error(`The music asset must be at least ${durationSeconds} seconds long.`);
  }
  const maximumStart = Math.max(0, artifact.durationSeconds - durationSeconds);
  const anchors = [
    { id: "opening" as const, label: "Opening preview", ratio: 0.03 },
    { id: "middle" as const, label: "Middle preview", ratio: 0.38 },
    { id: "late" as const, label: "Late preview", ratio: 0.7 },
  ];
  const seen = new Set<number>();
  return anchors.flatMap(({ id, label, ratio }) => {
    const aligned = alignedStart(artifact, maximumStart * ratio, maximumStart);
    const rounded = Math.round(aligned.seconds * 1000) / 1000;
    if (seen.has(rounded)) return [];
    seen.add(rounded);
    return [{
      id,
      label,
      sourceStartSeconds: rounded,
      durationSeconds,
      beatAligned: aligned.beatAligned,
      evidence: [
        aligned.beatAligned ? "Start aligned to a detected beat." : "No reliable beat was detected near this window.",
        insideSilence(artifact, rounded) ? "The window starts in measured silence; preview before use." : "The window does not start in measured silence.",
        "Creative quality is intentionally left for creator preview.",
      ],
      requiresCreatorPreview: true,
    }];
  });
};

export const assertMusicAssetPublishable = (
  asset: Pick<Asset, "id" | "mediaType" | "provenance">,
  context: MusicUseContext = {},
): void => {
  if (asset.mediaType !== "audio") throw new Error(`Project asset ${asset.id} is not audio.`);
  const rights = asset.provenance?.rights;
  if (!rights?.publishable || !rights.license.trim()) {
    throw new Error(`Project asset ${asset.id} is not cleared for publication. Import an owned or licensed recording with its rights record first.`);
  }
  const extended = rights as unknown as Record<string, unknown>;
  const commercial = extended.commercial;
  if (context.commercial !== false && commercial === false) {
    throw new Error(`Project asset ${asset.id} is not licensed for commercial use.`);
  }
  const expiresAt = timestamp(extended.expiresAt);
  if (expiresAt !== undefined && expiresAt <= Date.now()) throw new Error(`Project asset ${asset.id} has an expired music license.`);
  const requestedPlatform = context.platform?.trim().toLocaleLowerCase();
  const platforms = strings(extended.platforms);
  if (requestedPlatform && platforms.length > 0 && !platforms.includes(requestedPlatform) && !platforms.includes("all")) {
    throw new Error(`Project asset ${asset.id} is not licensed for ${context.platform}.`);
  }
};
