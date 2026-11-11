import { randomUUID } from "node:crypto";
import { loadAtteConfig } from "./config.js";
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  ATTELIER_SESSION_SCHEMA_VERSION,
  type AttelierModelSelection,
  type AttelierMediaRouters,
  type AttelierSessionGoal,
  type AttelierSessionEvent,
  type AttelierSessionEventInput,
  type AttelierSessionProjection,
} from "@attelier/agent-schema";
import { parseAttelierSessionEvent, projectAttelierSessionEvents } from "./session-projection.js";

const SESSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const LOCK_WAIT_MS = 10;
const LOCK_ATTEMPTS = 200;
const STALE_LOCK_MS = 30_000;

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const processIsAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

const nearestWorkspaceRoot = (cwd: string): string => {
  let cursor = path.resolve(cwd);
  while (true) {
    if (existsSync(path.join(cursor, "pnpm-workspace.yaml")) || existsSync(path.join(cursor, ".git"))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return path.resolve(cwd);
    cursor = parent;
  }
};

/** Resolve the durable session root. `loadAtteConfig` is the only caller that
 * reads the environment; every other caller passes an explicit override. */
export const defaultAttelierSessionRoot = (
  cwd = process.cwd(),
  override?: string,
): string => path.resolve(override || path.join(nearestWorkspaceRoot(cwd), ".data", "agent-harness", "sessions"));

const assertSessionId = (sessionId: string): string => {
  const normalized = sessionId.trim().toLowerCase();
  if (!SESSION_ID.test(normalized)) throw new Error(`Invalid Attelier session id ${sessionId}.`);
  return normalized;
};

export type CreateAttelierSessionInput = {
  title?: string;
  workingDirectory?: string;
  projectId?: string | null;
  model?: AttelierModelSelection;
  mediaRouters?: Partial<AttelierMediaRouters>;
  budgetUsd?: number | null;
  goal?: AttelierSessionGoal | null;
  aiLocked?: boolean;
  forkedFrom?: { sessionId: string; sequence: number };
};

export type ForkAttelierSessionInput = {
  title?: string;
  workingDirectory?: string;
};

export interface AttelierSessionRepository {
  create(input?: CreateAttelierSessionInput): Promise<AttelierSessionProjection>;
  fork(sessionId: string, input?: ForkAttelierSessionInput): Promise<AttelierSessionProjection>;
  read(sessionId: string): Promise<AttelierSessionEvent[]>;
  project(sessionId: string): Promise<AttelierSessionProjection>;
  append(sessionId: string, input: AttelierSessionEventInput): Promise<AttelierSessionEvent>;
  list(limit?: number): Promise<AttelierSessionProjection[]>;
  resolve(reference?: string): Promise<AttelierSessionProjection>;
}

export class AttelierSessionStore implements AttelierSessionRepository {
  readonly rootDir: string;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: { rootDir?: string; now?: () => number; createId?: () => string } = {}) {
    this.rootDir = path.resolve(options.rootDir ?? loadAtteConfig().dataDir);
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.rootDir, `${assertSessionId(sessionId)}.jsonl`);
  }

  private lockPath(sessionId: string): string {
    return path.join(this.rootDir, `${assertSessionId(sessionId)}.lock`);
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.rootDir, 0o700);
  }

  private async withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    await this.ensureRoot();
    const lockPath = this.lockPath(sessionId);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      try {
        const candidate = await open(lockPath, "wx", 0o600);
        try {
          await candidate.writeFile(JSON.stringify({ pid: process.pid, createdAt: this.now() }), "utf8");
          await candidate.sync();
          handle = candidate;
        } catch (writeError) {
          await candidate.close();
          await unlink(lockPath).catch(() => undefined);
          throw writeError;
        }
        break;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
        try {
          const lock = await stat(lockPath);
          if (this.now() - lock.mtimeMs > STALE_LOCK_MS) {
            let ownerAlive = false;
            try {
              const owner = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown };
              ownerAlive = typeof owner.pid === "number" && processIsAlive(owner.pid);
            } catch {
              ownerAlive = false;
            }
            if (!ownerAlive) await unlink(lockPath).catch((unlinkError: unknown) => {
              if (!(unlinkError instanceof Error) || !("code" in unlinkError) || unlinkError.code !== "ENOENT") throw unlinkError;
            });
          }
        } catch (statError) {
          if (!(statError instanceof Error) || !("code" in statError) || statError.code !== "ENOENT") throw statError;
        }
        await delay(LOCK_WAIT_MS);
      }
    }
    if (!handle) throw new Error(`Attelier session ${sessionId} is busy.`);
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(lockPath).catch((error: unknown) => {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      });
    }
  }

  private async readUnsafe(sessionId: string): Promise<AttelierSessionEvent[]> {
    const file = this.sessionPath(sessionId);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Attelier session ${sessionId} was not found.`);
      }
      throw error;
    }
    const events = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return parseAttelierSessionEvent(JSON.parse(line) as unknown);
        } catch (error) {
          throw new Error(`Invalid Attelier session ${sessionId} at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    projectAttelierSessionEvents(events);
    return events;
  }

  async create(input: CreateAttelierSessionInput = {}): Promise<AttelierSessionProjection> {
    await this.ensureRoot();
    const sessionId = assertSessionId(this.createId());
    const createdAt = this.now();
    const event: AttelierSessionEvent = {
      schemaVersion: ATTELIER_SESSION_SCHEMA_VERSION,
      eventId: this.createId(),
      sessionId,
      sequence: 1,
      createdAt,
      type: "session.created",
      data: {
        title: input.title?.trim() || `Attelier ${sessionId.slice(0, 8)}`,
        workingDirectory: path.resolve(input.workingDirectory ?? process.cwd()),
        model: input.model ?? { mode: "pinned", modelId: "openai:gpt-5.6-luna" },
        ...(input.mediaRouters ? { mediaRouters: input.mediaRouters } : {}),
        projectId: input.projectId?.trim() || null,
        ...(input.forkedFrom ? { forkedFrom: input.forkedFrom } : {}),
        ...(input.budgetUsd === undefined ? {} : { budgetUsd: input.budgetUsd }),
        ...(input.goal === undefined ? {} : { goal: input.goal }),
        ...(input.aiLocked === undefined ? {} : { aiLocked: input.aiLocked }),
      },
    };
    const file = this.sessionPath(sessionId);
    await writeFile(file, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (process.platform !== "win32") await chmod(file, 0o600);
    return projectAttelierSessionEvents([event]);
  }

  async fork(sessionId: string, input: ForkAttelierSessionInput = {}): Promise<AttelierSessionProjection> {
    const parent = await this.project(sessionId);
    const committed = Math.max(parent.usage.actualAmount, parent.usage.estimatedAmount) +
      parent.usage.reservedAmount + parent.usage.pendingReconciliationAmount;
    return this.create({
      title: input.title?.trim() || `${parent.title} · fork`,
      workingDirectory: input.workingDirectory ?? parent.workingDirectory,
      projectId: parent.projectId,
      model: parent.model,
      mediaRouters: parent.mediaRouters,
      budgetUsd: parent.budgetUsd === null ? null : Math.max(0, parent.budgetUsd - committed),
      goal: parent.goal,
      ...(parent.aiLocked === undefined ? {} : { aiLocked: parent.aiLocked }),
      forkedFrom: { sessionId: parent.id, sequence: parent.lastSequence },
    });
  }

  async read(sessionId: string): Promise<AttelierSessionEvent[]> {
    const normalized = assertSessionId(sessionId);
    return this.withSessionLock(normalized, () => this.readUnsafe(normalized));
  }

  async project(sessionId: string): Promise<AttelierSessionProjection> {
    return projectAttelierSessionEvents(await this.read(sessionId));
  }

  async append(sessionId: string, input: AttelierSessionEventInput): Promise<AttelierSessionEvent> {
    const normalized = assertSessionId(sessionId);
    return this.withSessionLock(normalized, async () => {
      const events = await this.readUnsafe(normalized);
      if (input.eventId) {
        const existing = events.find(({ eventId }) => eventId === input.eventId);
        if (existing) {
          if (existing.type !== input.type || JSON.stringify(existing.data) !== JSON.stringify(input.data)) {
            throw new Error(`Attelier session event ${input.eventId} was retried with different data.`);
          }
          return existing;
        }
      }
      const event = {
        schemaVersion: ATTELIER_SESSION_SCHEMA_VERSION,
        eventId: input.eventId ?? this.createId(),
        sessionId: normalized,
        sequence: events.length + 1,
        createdAt: this.now(),
        type: input.type,
        data: input.data,
      } as AttelierSessionEvent;
      projectAttelierSessionEvents([...events, event]);
      const file = this.sessionPath(normalized);
      if (process.platform !== "win32") await chmod(file, 0o600);
      const fileHandle = await open(file, "a", 0o600);
      try {
        await fileHandle.writeFile(`${JSON.stringify(event)}\n`, "utf8");
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
      return event;
    });
  }

  async list(limit = 50): Promise<AttelierSessionProjection[]> {
    await this.ensureRoot();
    const files = (await readdir(this.rootDir))
      .filter((file) => file.endsWith(".jsonl") && SESSION_ID.test(file.slice(0, -6)));
    const projections = await Promise.all(files.map((file) => this.project(file.slice(0, -6))));
    return projections
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  async resolve(reference?: string): Promise<AttelierSessionProjection> {
    const sessions = await this.list(200);
    if (sessions.length === 0) throw new Error("No saved Attelier sessions were found in this workspace.");
    const normalized = reference?.trim().toLowerCase();
    if (!normalized || normalized === "last") return sessions[0]!;
    const matches = sessions.filter(({ id, title }) => id === normalized || id.startsWith(normalized) || title.toLowerCase() === normalized);
    if (matches.length === 0) throw new Error(`No Attelier session matches ${reference}.`);
    if (matches.length > 1) throw new Error(`Attelier session reference ${reference} is ambiguous.`);
    return matches[0]!;
  }
}
