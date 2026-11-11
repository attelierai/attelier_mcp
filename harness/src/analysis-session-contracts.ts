export type AttelierAnalysisCapability = "transcribe" | "analyze_audio" | "identify_music" | "reconstruct_video";

export type AttelierAnalysisJob = {
  id: string;
  projectId: string;
  assetId: string;
  capability: AttelierAnalysisCapability;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  artifactId?: string;
  error?: string;
  updatedAt: number;
};

export type AnalysisRunResult = {
  job: AttelierAnalysisJob;
  artifact?: unknown;
};

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid object.`);
  return value as Record<string, unknown>;
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} returned an invalid string.`);
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} returned an invalid number.`);
  return value;
};

export const parseAnalysisJob = (value: unknown): AttelierAnalysisJob => {
  const item = record(value, "analysis job");
  const capability = string(item.capability, "analysis job capability") as AttelierAnalysisCapability;
  const status = string(item.status, "analysis job status") as AttelierAnalysisJob["status"];
  if (!["transcribe", "analyze_audio", "identify_music", "reconstruct_video"].includes(capability)) {
    throw new Error(`analysis job returned unsupported capability ${capability}.`);
  }
  if (!["queued", "running", "complete", "failed"].includes(status)) {
    throw new Error(`analysis job returned unsupported status ${status}.`);
  }
  const progress = finiteNumber(item.progress, "analysis job progress");
  if (progress < 0 || progress > 1) throw new Error("analysis job progress must be between 0 and 1.");
  return {
    id: string(item.id, "analysis job id"),
    projectId: string(item.projectId, "analysis job projectId"),
    assetId: string(item.assetId, "analysis job assetId"),
    capability,
    status,
    progress,
    ...(typeof item.artifactId === "string" ? { artifactId: item.artifactId } : {}),
    ...(typeof item.error === "string" ? { error: item.error } : {}),
    updatedAt: finiteNumber(item.updatedAt, "analysis job updatedAt"),
  };
};
