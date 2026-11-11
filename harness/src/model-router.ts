import type { AttelierMediaFamily, AttelierModelSelection, AttelierRoutingPolicy } from "@attelier/agent-schema";

export const ATTELIER_ROUTE_EVIDENCE_VERSION = "1.0.0";

export type AttelierRouteTarget = AttelierMediaFamily;
export type AttelierRouteEvidenceStatus = "admitted" | "provider-declared" | "unverified";

export type AttelierRouteCandidate = {
  id: string;
  family: AttelierMediaFamily;
  providerId: string;
  modelId: string;
  capability?: string;
  available: boolean;
  manualOnly?: boolean;
  specialties?: string[];
  /** Empirical valid/success rate. It is a reliability signal, not a claim of
   * perceptual quality, and is used only when no calibrated quality score exists. */
  successRate?: number;
  qualityScore?: number;
  /** Unitless provider/runtime cost class. Lower is cheaper. Use this when a
   * trustworthy per-turn USD estimate is not available (for example, a
   * subscription-backed planner). */
  relativeCost?: number;
  estimatedCostUsd?: number;
  /** Unitless provider/runtime latency class. Lower is faster. */
  relativeLatency?: number;
  latencyMs?: number;
  evidenceStatus: AttelierRouteEvidenceStatus;
  evidenceVersion: string;
  fallbackIds?: string[];
};

export type AttelierRouteDecision = {
  registryVersion: string;
  target: AttelierRouteTarget;
  intent: string;
  policy: AttelierRoutingPolicy | "manual";
  selected: AttelierRouteCandidate;
  ranked: AttelierRouteCandidate[];
  reason: string;
  fallback: boolean;
};

const MEDIA_CAPABILITIES: Readonly<Record<AttelierMediaFamily, ReadonlySet<string>>> = {
  video: new Set(["basic_video_generation", "text_to_video", "image_to_video", "reference_to_video", "lip_sync", "broll_search", "stock_acquire"]),
  image: new Set(["text_to_image", "image_to_image", "product_shot"]),
  voice: new Set(["voice_generation", "translation", "localize_project"]),
  music: new Set(["music_generation", "sound_effect_generation"]),
  effects: new Set(["background_removal", "region_inpaint", "upscale"]),
};

/** One capability belongs to exactly one media router. Registering a new
 * capability therefore requires an explicit family decision instead of
 * silently placing it in a global model pool. */
export const mediaFamilyForCapability = (capability: string): AttelierMediaFamily => {
  const normalized = capability.trim().toLowerCase();
  for (const [family, capabilities] of Object.entries(MEDIA_CAPABILITIES) as Array<[AttelierMediaFamily, ReadonlySet<string>]>) {
    if (capabilities.has(normalized)) return family;
  }
  throw new Error(`Capability ${capability} has no registered Attelier media router family.`);
};

const normalized = (value: number | undefined, minimum: number, maximum: number, invert = false): number => {
  if (value === undefined || !Number.isFinite(value)) return 0.5;
  const result = maximum <= minimum ? 1 : Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return invert ? 1 - result : result;
};

const specialtyScore = (candidate: AttelierRouteCandidate, intent: string): number => {
  const terms = new Set(intent.toLowerCase().split(/[^a-z0-9áéíóúñ]+/i).filter((term) => term.length > 2));
  return candidate.specialties?.some((specialty) => terms.has(specialty.toLowerCase())) ? 1 : 0;
};

const eligibleCandidates = (
  candidates: readonly AttelierRouteCandidate[],
  target: AttelierRouteTarget,
  capability: string | undefined,
  automatic: boolean,
): AttelierRouteCandidate[] => candidates.filter((candidate) =>
  candidate.available &&
  candidate.family === target &&
  (!capability || !candidate.capability || candidate.capability === capability) &&
  (!automatic || (!candidate.manualOnly && candidate.evidenceStatus !== "unverified")));

export const routeAttelierMediaModel = (input: {
  selection: AttelierModelSelection;
  target: AttelierRouteTarget;
  intent: string;
  capability?: string;
  candidates: readonly AttelierRouteCandidate[];
  registryVersion?: string;
}): AttelierRouteDecision => {
  const registryVersion = input.registryVersion ?? ATTELIER_ROUTE_EVIDENCE_VERSION;
  const intent = input.intent.trim() || input.capability || input.target;
  if (input.selection.mode === "pinned") {
    const pinnedId = input.selection.modelId;
    const eligible = eligibleCandidates(input.candidates, input.target, input.capability, false);
    const selected = eligible.find((candidate) => candidate.id === pinnedId || candidate.modelId === pinnedId || candidate.providerId === pinnedId);
    if (!selected) throw new Error(`Pinned ${input.target} route ${pinnedId} is unavailable or incompatible.`);
    return {
      registryVersion,
      target: input.target,
      intent,
      policy: "manual",
      selected,
      ranked: [selected],
      reason: `Manually pinned ${selected.id}; no silent model substitution is allowed.`,
      fallback: false,
    };
  }

  const eligible = eligibleCandidates(input.candidates, input.target, input.capability, true);
  if (eligible.length === 0) throw new Error(`No admitted or provider-declared ${input.target} route is currently available.`);
  const quality = eligible.map(({ qualityScore, successRate }) => qualityScore ?? successRate ?? 0.5);
  const costs = eligible.map(({ estimatedCostUsd, relativeCost }) => estimatedCostUsd ?? relativeCost ?? 0);
  const latencies = eligible.map(({ latencyMs, relativeLatency }) => latencyMs ?? relativeLatency ?? 0);
  const extrema = {
    quality: [Math.min(...quality), Math.max(...quality)] as const,
    cost: [Math.min(...costs), Math.max(...costs)] as const,
    latency: [Math.min(...latencies), Math.max(...latencies)] as const,
  };
  const weights = input.selection.policy === "quality"
    ? { quality: 0.82, cost: 0.08, latency: 0.05, specialty: 0.05 }
    : input.selection.policy === "cost"
      ? { quality: 0.20, cost: 0.62, latency: 0.13, specialty: 0.05 }
      : { quality: 0.52, cost: 0.23, latency: 0.15, specialty: 0.10 };
  const scored = eligible.map((candidate) => ({
    candidate,
    score:
      weights.quality * normalized(candidate.qualityScore ?? candidate.successRate, ...extrema.quality) +
      weights.cost * normalized(candidate.estimatedCostUsd ?? candidate.relativeCost, ...extrema.cost, true) +
      weights.latency * normalized(candidate.latencyMs ?? candidate.relativeLatency, ...extrema.latency, true) +
      weights.specialty * specialtyScore(candidate, intent),
  })).sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
  const ranked = scored.map(({ candidate }) => candidate);
  const selected = ranked[0]!;
  return {
    registryVersion,
    target: input.target,
    intent,
    policy: input.selection.policy,
    selected,
    ranked,
    reason: `Automatic ${input.selection.policy} route selected ${selected.id} from ${ranked.length} eligible candidate${ranked.length === 1 ? "" : "s"}; unavailable, manual-only and unverified routes were excluded.`,
    fallback: false,
  };
};
