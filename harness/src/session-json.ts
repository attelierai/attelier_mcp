import type { AttelierJsonValue } from "@attelier/agent-schema";

const MAX_STRING_LENGTH = 20_000;
const MAX_ARRAY_ITEMS = 200;
const MAX_OBJECT_KEYS = 200;
const MAX_JSON_DEPTH = 12;

const isSecretKey = (key: string): boolean => {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized === "token" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("password") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token");
};

const jsonValue = (value: unknown, depth = 0): AttelierJsonValue => {
  if (depth > MAX_JSON_DEPTH) return "[TRUNCATED_DEPTH]";
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return typeof value === "number" && !Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]` : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => jsonValue(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, isSecretKey(key) ? "[REDACTED]" : jsonValue(entry, depth + 1)]),
    );
  }
  return String(value);
};

/** Convert arbitrary provider/tool output into bounded, credential-redacted
 * session JSON before it enters an append-only authority. */
export const sanitizeSessionJson = (value: unknown): AttelierJsonValue => jsonValue(value);
