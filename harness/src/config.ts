import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ATTE_SKILLS_ROOT } from "@atte/kit/skill-loader";
import { defaultAttelierSessionRoot } from "./session-store.js";

/**
 * One validated view of Atte's environment.
 *
 * Every non-test module under `harness/src` reads configuration
 * through this module instead of touching `process.env` directly, so the
 * terminal binary, the web proxy and the MCP bridge cannot drift apart and a
 * test can construct an explicit environment without mutating the process.
 *
 * Provider keys are reported as presence only. This module never returns a
 * secret in a shape that would be logged with the rest of the config.
 */
export type AtteEnvironment = Readonly<Record<string, string | undefined>>;

export type AtteProviderKeys = {
  readonly openAi: boolean;
  readonly anthropic: boolean;
  readonly fal: boolean;
  readonly elevenLabs: boolean;
};

export const ATTE_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type AtteReasoningEffort = (typeof ATTE_REASONING_EFFORTS)[number];
export const ATTE_DEFAULT_REASONING_EFFORT: AtteReasoningEffort = "medium";

export type AtteConfig = {
  /** Durable session/data directory for offline sessions. */
  readonly dataDir: string;
  /** Attelier API base URL, without a trailing slash. */
  readonly apiUrl: string;
  /** API bearer token, or "" when Atte runs fully offline. */
  readonly apiToken: string;
  /** Web editor origin used by `/open`. */
  readonly webEditorUrl: string;
  /** Which provider credentials are configured. Never the values. */
  readonly providerKeys: AtteProviderKeys;
  /** Default coordinator LLM for a new session. */
  readonly defaultCoordinatorModel: string;
  /** Default OpenAI reasoning budget for a coordinator turn. */
  readonly defaultReasoningEffort: AtteReasoningEffort;
  /** Absolute directory holding `<skill-id>/SKILL.md`. */
  readonly skillsRoot: string;
};

export const ATTE_DEFAULT_API_URL = "http://127.0.0.1:8787";
export const ATTE_DEFAULT_WEB_EDITOR_URL = "http://127.0.0.1:3008";
/** The coordinator default stays the already-configured OpenAI model; `/model`
 * remains the only way to select another one. */
import { ATTE_DEFAULT_COORDINATOR_MODEL } from "./model-defaults.js";
export { ATTE_DEFAULT_COORDINATOR_MODEL };

/** The workspace root: the nearest ancestor holding `pnpm-workspace.yaml`. */
export const atteRepositoryRoot = (from: string): string | undefined => {
  let current = path.resolve(from);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
};

/**
 * Read the repository's `.env` the way the API's own start script does.
 *
 * Without this the terminal `atte` had no model credential and silently
 * dropped to the deterministic local planner, which looks like a much worse
 * agent rather than a missing key. Deliberately a small KEY=VALUE parser and
 * not a dependency: it handles `export `, `#` comments, surrounding quotes and
 * nothing else, because anything richer belongs in a real env loader.
 */
export const parseEnvFile = (contents: string): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
      value = value.slice(1, -1);
    } else {
      value = value.split(" #")[0]!.trim();
    }
    values[match[1]!] = value;
  }
  return values;
};

/** Environment with the repository `.env` filled in underneath. A real process
 * variable always wins, so an explicit export still overrides the file. */
export const atteEnvironmentWithRepositoryFile = (
  env: AtteEnvironment = process.env,
  cwd: string = process.cwd(),
): AtteEnvironment => {
  const roots = [cwd, path.dirname(fileURLToPath(import.meta.url))];
  for (const candidate of roots) {
    const root = atteRepositoryRoot(candidate);
    const file = root ? path.join(root, ".env") : undefined;
    if (!file || !existsSync(file)) continue;
    try {
      return { ...parseEnvFile(readFileSync(file, "utf8")), ...env };
    } catch {
      // An unreadable .env is not a reason to refuse to start.
    }
  }
  return env;
};

const trimmed = (env: AtteEnvironment, key: string): string | undefined => {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const validUrl = (raw: string | undefined, fallback: string, key: string): string => {
  const value = raw ?? fallback;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute http(s) URL, received ${value}.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} must use http or https, received ${parsed.protocol}.`);
  }
  return value.replace(/\/+$/, "");
};

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/;

const validModelId = (raw: string | undefined): string => {
  const value = raw ?? ATTE_DEFAULT_COORDINATOR_MODEL;
  if (!MODEL_ID.test(value)) {
    throw new Error(`ATTELIER_LLM_MODEL must be a plain model id, received ${value}.`);
  }
  return value;
};

const validReasoningEffort = (raw: string | undefined): AtteReasoningEffort => {
  const value = raw ?? ATTE_DEFAULT_REASONING_EFFORT;
  if (!ATTE_REASONING_EFFORTS.includes(value as AtteReasoningEffort)) {
    throw new Error(`ATTELIER_LLM_REASONING_EFFORT must be one of ${ATTE_REASONING_EFFORTS.join(", ")}, received ${value}.`);
  }
  return value as AtteReasoningEffort;
};

const validToken = (raw: string | undefined): string => {
  if (raw === undefined) return "";
  if (raw.length > 4_096 || /\s/.test(raw)) {
    throw new Error("ATTELIER_API_TOKEN must be a single whitespace-free bearer token.");
  }
  return raw;
};

/** Read and validate Atte's configuration. Throws on a malformed value rather
 * than silently falling back, so a typo cannot point the CLI at the wrong API. */
export const loadAtteConfig = (
  rawEnv: AtteEnvironment = process.env,
  options: { cwd?: string; readRepositoryEnvFile?: boolean } = {},
): AtteConfig => {
  // The repository `.env` fills in only for the real process environment. A
  // test that passes an explicit environment stays hermetic.
  const readFile = options.readRepositoryEnvFile ?? rawEnv === process.env;
  const env = readFile ? atteEnvironmentWithRepositoryFile(rawEnv, options.cwd ?? process.cwd()) : rawEnv;
  return {
    dataDir: defaultAttelierSessionRoot(options.cwd ?? process.cwd(), trimmed(env, "ATTELIER_SESSION_DIR")),
    apiUrl: validUrl(trimmed(env, "ATTELIER_API_URL"), ATTE_DEFAULT_API_URL, "ATTELIER_API_URL"),
    apiToken: validToken(trimmed(env, "ATTELIER_API_TOKEN")),
    webEditorUrl: validUrl(trimmed(env, "ATTELIER_WEB_EDITOR_URL"), ATTE_DEFAULT_WEB_EDITOR_URL, "ATTELIER_WEB_EDITOR_URL"),
    providerKeys: {
      openAi: Boolean(trimmed(env, "OPENAI_API_KEY")),
      anthropic: Boolean(trimmed(env, "ANTHROPIC_API_KEY")),
      fal: Boolean(trimmed(env, "FAL_KEY") ?? trimmed(env, "FAL_API_KEY")),
      elevenLabs: Boolean(trimmed(env, "ELEVENLABS_API_KEY")),
    },
    defaultCoordinatorModel: validModelId(trimmed(env, "ATTELIER_LLM_MODEL")),
    defaultReasoningEffort: validReasoningEffort(trimmed(env, "ATTELIER_LLM_REASONING_EFFORT")),
    skillsRoot: trimmed(env, "ATTE_SKILLS_ROOT") ?? DEFAULT_ATTE_SKILLS_ROOT,
  };
};
