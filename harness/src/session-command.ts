import {
  ATTELIER_MEDIA_FAMILIES,
  type AttelierMediaFamily,
  type AttelierModelSelection,
  type AttelierProjectPlanPatch,
  type AttelierSessionEvent,
  type AttelierSessionProjection,
} from "@attelier/agent-schema";
import {
  AttelierHeadlessSession,
  parseMediaRoutingSelection,
  parseModelSelection,
} from "./session-runtime.js";

export const ATTELIER_SHARED_COMMANDS = [
  "/help",
  "/status",
  "/usage",
  "/resume",
  "/goal",
  "/model",
  "/route",
  "/budget",
  "/lock",
  "/unlock",
  "/project",
  "/library",
  "/music",
  "/brief",
  "/plan",
  "/edit",
  "/apply",
  "/undo",
  "/redo",
  "/restore",
  "/checkpoint",
  "/versions",
  "/jobs",
  "/renders",
  "/history",
] as const;

export type AttelierSessionInputResult = {
  kind: "command" | "conversation";
  message: string;
  projection: AttelierSessionProjection;
  command?: string;
  outcome?: unknown;
};

const modelLabel = (selection: AttelierModelSelection): string => selection.mode === "auto"
  ? `auto (${selection.policy})`
  : selection.modelId;

const flagPattern = (name: string) => new RegExp(`(?:^|\\s)--${name}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`, "i");

export const parseSharedEdit = (raw: string): {
  prompt: string;
  selection?: { elementId?: string; assetId?: string; start?: string; end?: string };
} => {
  let prompt = raw.trim();
  const selection: { elementId?: string; assetId?: string; start?: string; end?: string } = {};
  for (const [flag, property] of [
    ["element", "elementId"],
    ["asset", "assetId"],
    ["start", "start"],
    ["end", "end"],
  ] as const) {
    const match = flagPattern(flag).exec(prompt);
    if (!match) continue;
    const value = match[1] ?? match[2] ?? match[3];
    if (!value) throw new Error(`--${flag} requires a value.`);
    selection[property] = value;
    prompt = `${prompt.slice(0, match.index)} ${prompt.slice(match.index + match[0].length)}`.trim();
  }
  if (!prompt) throw new Error("An edit instruction is required after the selection flags.");
  return { prompt, ...(Object.keys(selection).length ? { selection } : {}) };
};

const eventLabel = (event: AttelierSessionEvent): string => {
  if (event.type === "message.appended") return `${event.data.role}: ${event.data.content.replace(/\s+/g, " ").slice(0, 100)}`;
  if (event.type === "goal.changed") return `goal ${event.data.action}${event.data.goal ? `: ${event.data.goal.objective.slice(0, 80)}` : ""}`;
  if (event.type === "media_router.changed") return `${event.data.family} route: ${modelLabel(event.data.selection)}`;
  if (event.type === "project.revision.created") return `project revision ${event.data.revision}`;
  if (event.type === "project.revision.restored") return `${event.data.intent}: revision ${event.data.targetRevision} restored as ${event.data.revision}`;
  if (event.type === "run.failed") return `run failed: ${event.data.error}`;
  if (event.type === "run.completed") return `run complete: ${event.data.summary}`;
  if (event.type === "run.interrupted") return `run interrupted: ${event.data.message}`;
  if (event.type === "usage.recorded") return `usage: $${event.data.actualAmount.toFixed(4)} ${event.data.providerId}`;
  return event.type;
};

const projectPlanText = (plan: Awaited<ReturnType<AttelierHeadlessSession["getProjectPlan"]>>): string => {
  const lines = [`Project plan v${plan.version}`];
  if (plan.logline) lines.push(`Idea: ${plan.logline}`);
  if (plan.audience) lines.push(`Audience: ${plan.audience}`);
  if (plan.channel) lines.push(`Channel: ${plan.channel}`);
  if (plan.tone) lines.push(`Tone: ${plan.tone}`);
  if (plan.cta) lines.push(`CTA: ${plan.cta}`);
  if (plan.script) lines.push(`Script:\n${plan.script}`);
  plan.beats.forEach((beat, index) => lines.push(`${index + 1}. ${beat.title}${beat.durationSeconds === undefined ? "" : ` · ${beat.durationSeconds}s`}${beat.description ? ` — ${beat.description}` : ""}`));
  return lines.join("\n");
};

const statusText = (projection: AttelierSessionProjection): string => [
  `Session: ${projection.title}`,
  `Project: ${projection.projectId ?? "not selected"}${projection.projectRevision === null ? "" : ` · revision ${projection.projectRevision}`}`,
  `Goal: ${projection.goal ? `${projection.goal.status} · ${projection.goal.objective}` : "not set"}`,
  `Model: ${modelLabel(projection.model)}`,
  `AI: ${projection.aiLocked ? "editing-only" : "unlocked"}`,
  `Budget: ${projection.budgetUsd === null ? "not set" : `$${projection.budgetUsd.toFixed(4)} USD`}`,
  `Spend: $${projection.usage.actualAmount.toFixed(4)} actual · $${projection.usage.reservedAmount.toFixed(4)} reserved`,
].join("\n");

const librarySearchText = (result: Record<string, unknown>): string => {
  const assets = Array.isArray(result.assets) ? result.assets : [];
  if (assets.length === 0) return "No Library assets matched.";
  return assets.map((value) => {
    const asset = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const id = typeof asset.id === "string" ? asset.id : "unknown-id";
    const name = typeof asset.name === "string" ? asset.name : "Untitled asset";
    const kind = typeof asset.kind === "string"
      ? asset.kind
      : typeof asset.mediaType === "string"
        ? asset.mediaType
        : "media";
    return `${id} · ${kind} · ${name}`;
  }).join("\n");
};

const musicSearchText = (result: Record<string, unknown>): string => {
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  const lines: string[] = [];
  if (candidates.length > 0) lines.push(...candidates.map((value) => {
    const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return `${String(candidate.assetId ?? "unknown-id")} · ${String(candidate.name ?? "Untitled music")} · ${String(candidate.license ?? "license missing")}${typeof candidate.bpm === "number" ? ` · ${candidate.bpm} BPM` : ""}`;
  }));
  const freeCatalog = Array.isArray(result.freeCatalog) ? result.freeCatalog : [];
  if (freeCatalog.length > 0) {
    if (lines.length) lines.push("", "Free catalog:");
    lines.push(...freeCatalog.map((value) => {
      const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
      return `${String(candidate.id ?? "unknown-id")} · ${String(candidate.name ?? "Untitled music")} — ${String(candidate.artist ?? "Unknown artist")} · ${String(candidate.license ?? "license missing")}${candidate.instrumental === true ? " · instrumental" : ""}`;
    }));
    lines.push("", "Save one with /music acquire TRACK_ID.");
  }
  if (lines.length) return lines.join("\n");
  const routes = Array.isArray(result.licensingRoutes) ? result.licensingRoutes : [];
  lines.push("No rights-cleared music matched.");
  const catalog = result.catalog && typeof result.catalog === "object" && !Array.isArray(result.catalog)
    ? result.catalog as Record<string, unknown>
    : undefined;
  if (catalog?.status === "not_configured") lines.push("Free catalog: configure JAMENDO_CLIENT_ID on the Attelier API.");
  else if (catalog?.status === "unavailable") lines.push(`Free catalog unavailable: ${String(catalog.message ?? "provider error")}`);
  for (const value of routes) {
    const route = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    lines.push(`${String(route.label ?? route.provider)} · ${String(route.url ?? "")}`);
  }
  return lines.join("\n");
};

const commandResult = async (
  runtime: AttelierHeadlessSession,
  command: string,
  message: string,
): Promise<AttelierSessionInputResult> => ({
  kind: "command",
  command,
  message,
  projection: await runtime.projection(),
});

/**
 * One transport-neutral input surface for Attelier. Terminal and Studio may render
 * the result differently, but commands, conversation, tools and durable state
 * are executed by the same headless session authority.
 */
export const runAttelierSessionInput = async (
  runtime: AttelierHeadlessSession,
  rawInput: string,
  options: { workingDirectory?: string; availableModels?: readonly string[] } = {},
): Promise<AttelierSessionInputResult> => {
  const input = rawInput.trim();
  if (!input) throw new Error("Attelier input cannot be empty.");
  if (!input.startsWith("/")) {
    const before = await runtime.projection();
    if (before.aiLocked) {
      await runtime.appendMessage("user", input);
      const edited = await runtime.planEdit({ prompt: input, commit: true });
      const message = edited.committedRevision === undefined
        ? edited.projection.pendingPlan?.summary ?? "The deterministic edit was simulated."
        : `${String(edited.plan.summary ?? "Deterministic edit applied.")} Revision ${edited.committedRevision}.`;
      const projection = await runtime.appendMessage("assistant", message);
      return {
        kind: "conversation",
        message,
        projection,
        outcome: edited.plan,
      };
    }
    // Requests in plain language are Atte's: the product runs its agent, not this command surface.
    throw new Error("Ask Atte: this surface runs slash commands and AI-locked deterministic edits only.");
  }

  const separator = input.search(/\s/);
  const command = (separator === -1 ? input : input.slice(0, separator)).toLowerCase();
  const argument = separator === -1 ? "" : input.slice(separator).trim();
  switch (command) {
    case "/help":
      return commandResult(runtime, command, `Shared Attelier commands: ${ATTELIER_SHARED_COMMANDS.join(", ")}. Natural language uses the selected coordinator model and the same durable session.`);
    case "/status": {
      const projection = await runtime.projection();
      return { kind: "command", command, message: statusText(projection), projection };
    }
    case "/usage": {
      if (argument) throw new Error("/usage does not take arguments.");
      const projection = await runtime.projection();
      const usage = projection.usage;
      return {
        kind: "command",
        command,
        message: [
          `$${usage.actualAmount.toFixed(4)} actual · $${usage.estimatedAmount.toFixed(4)} estimated · $${usage.reservedAmount.toFixed(4)} reserved · $${usage.pendingReconciliationAmount.toFixed(4)} reconciling · $${usage.quotedAmount.toFixed(4)} quoted`,
          `${usage.modelInputTokens} input tokens · ${usage.modelOutputTokens} output · ${usage.modelCachedInputTokens} cached · ${usage.modelReasoningTokens} reasoning${usage.unpricedModelTurns ? ` · ${usage.unpricedModelTurns} unpriced turn(s)` : ""}`,
        ].join("\n"),
        projection,
      };
    }
    case "/resume": {
      if (argument && argument !== "last") throw new Error("This session endpoint is already bound. Open another session before using /resume SESSION_ID.");
      const projection = await runtime.resume(options.workingDirectory ?? "studio");
      return { kind: "command", command, message: `Resumed ${projection.title}.`, projection };
    }
    case "/goal": {
      if (!argument) {
        const projection = await runtime.projection();
        return { kind: "command", command, message: projection.goal ? `${projection.goal.status} · ${projection.goal.objective}` : "No goal set.", projection };
      }
      const action = argument.toLowerCase();
      const projection = action === "pause" || action === "resume" || action === "block" || action === "clear" || action === "done" || action === "complete"
        ? await runtime.changeGoalStatus(action === "done" ? "complete" : action)
        : action.startsWith("edit ")
          ? await runtime.setGoal(argument.slice(5), "edit")
          : await runtime.setGoal(argument, (await runtime.projection()).goal ? "edit" : "set");
      return { kind: "command", command, message: projection.goal ? `${projection.goal.status} · ${projection.goal.objective}` : "Goal cleared.", projection };
    }
    case "/model": {
      if (!argument) {
        const projection = await runtime.projection();
        return { kind: "command", command, message: modelLabel(projection.model), projection };
      }
      if (argument === "list") {
        const projection = await runtime.projection();
        const models = [...new Set(options.availableModels ?? [])];
        return {
          kind: "command",
          command,
          message: models.length ? models.join("\n") : "No executable planner models are currently declared.",
          projection,
        };
      }
      const projection = await runtime.changeModel(parseModelSelection(argument));
      return { kind: "command", command, message: `Model ${modelLabel(projection.model)}.`, projection };
    }
    case "/route": {
      const [rawFamily, ...selectionParts] = argument.split(/\s+/).filter(Boolean);
      if (!rawFamily) {
        const projection = await runtime.projection();
        return {
          kind: "command",
          command,
          message: ATTELIER_MEDIA_FAMILIES.map((family) => `${family} · ${modelLabel(projection.mediaRouters[family])}`).join("\n"),
          projection,
        };
      }
      if (!ATTELIER_MEDIA_FAMILIES.includes(rawFamily as AttelierMediaFamily)) {
        throw new Error(`Media family must be one of: ${ATTELIER_MEDIA_FAMILIES.join(", ")}.`);
      }
      const family = rawFamily as AttelierMediaFamily;
      if (selectionParts.length === 0) {
        const projection = await runtime.projection();
        return { kind: "command", command, message: `${family} · ${modelLabel(projection.mediaRouters[family])}`, projection };
      }
      const projection = await runtime.changeMediaRouter(family, parseMediaRoutingSelection(selectionParts.join(" ")));
      return { kind: "command", command, message: `${family} route ${modelLabel(projection.mediaRouters[family])}.`, projection };
    }
    case "/budget": {
      if (!argument) {
        const projection = await runtime.projection();
        return { kind: "command", command, message: projection.budgetUsd === null ? "No session budget set." : `$${projection.budgetUsd.toFixed(4)} USD session budget.`, projection };
      }
      const projection = await runtime.changeBudget(argument.toLowerCase() === "clear" ? null : Number(argument.replace(/^\$/, "")));
      return { kind: "command", command, message: projection.budgetUsd === null ? "Session budget cleared." : `$${projection.budgetUsd.toFixed(4)} USD session budget.`, projection };
    }
    case "/lock":
    case "/unlock": {
      if (argument) throw new Error(`${command} does not take arguments.`);
      const projection = await runtime.changeAiLock(command === "/lock");
      return { kind: "command", command, message: projection.aiLocked ? "Editing-only lock enabled." : "AI lock disabled.", projection };
    }
    case "/project": {
      if (!argument) {
        const projection = await runtime.projection();
        return { kind: "command", command, message: projection.projectId ?? "No project selected.", projection };
      }
      const projection = await runtime.selectProject(argument === "clear" ? null : argument);
      return { kind: "command", command, message: projection.projectId ? `Project ${projection.projectId}.` : "Project cleared.", projection };
    }
    case "/library":
    case "/media": {
      const importMatch = argument.match(/^import\s+(\S+)$/i);
      if (importMatch?.[1]) {
        const imported = await runtime.importWorkspaceAsset(importMatch[1]);
        return commandResult(runtime, command, `${imported.workspaceAssetId} imported as ${imported.projectAssetId} at revision ${imported.revision}.`);
      }
      const result = await runtime.searchLibrary(argument ? { query: argument } : {});
      return commandResult(runtime, command, librarySearchText(result));
    }
    case "/music": {
      const [subcommand, ...parts] = argument.trim().split(/\s+/).filter(Boolean);
      if (!subcommand || subcommand === "search") {
        const query = subcommand === "search" ? parts.join(" ") : argument.trim();
        if (!query) throw new Error("Use /music search SONG_OR_MOOD.");
        const result = await runtime.searchMusicLibrary({ query, commercial: true });
        return commandResult(runtime, command, musicSearchText(result));
      }
      if (subcommand === "moments") {
        const assetId = parts[0];
        const durationSeconds = parts[1] === undefined ? 12 : Number(parts[1]);
        if (!assetId || !Number.isFinite(durationSeconds)) throw new Error("Use /music moments PROJECT_ASSET_ID [DURATION_SECONDS].");
        const moments = await runtime.suggestMusicAssetMoments(assetId, durationSeconds);
        return commandResult(runtime, command, moments.map((moment, index) =>
          `${index + 1}. ${moment.label} · source ${moment.sourceStartSeconds.toFixed(3)}s · ${moment.durationSeconds.toFixed(1)}s${moment.beatAligned ? " · beat-aligned" : ""}`,
        ).join("\n"));
      }
      if (subcommand === "acquire") {
        const trackId = parts[0];
        const commercial = parts[1]?.toLowerCase() !== "noncommercial";
        if (!trackId || !/^(?:jamendo:)?\d+$/.test(trackId) || parts.length > 2) {
          throw new Error("Use /music acquire JAMENDO_TRACK_ID [commercial|noncommercial].");
        }
        const acquired = await runtime.acquireFreeMusicTrack(trackId, commercial);
        const asset = acquired.asset && typeof acquired.asset === "object" && !Array.isArray(acquired.asset)
          ? acquired.asset as Record<string, unknown>
          : {};
        return commandResult(runtime, command, `${String(asset.name ?? trackId)} saved to the Music Library as ${String(asset.id ?? "unknown-id")}.`);
      }
      if (subcommand === "place") {
        const [assetId, rawSourceStart, rawDuration, rawTimelineStart, platform] = parts;
        const sourceStartSeconds = Number(rawSourceStart);
        const durationSeconds = Number(rawDuration);
        const timelineStartSeconds = rawTimelineStart === undefined ? undefined : Number(rawTimelineStart);
        if (!assetId || !Number.isFinite(sourceStartSeconds) || !Number.isFinite(durationSeconds) || (timelineStartSeconds !== undefined && !Number.isFinite(timelineStartSeconds))) {
          throw new Error("Use /music place PROJECT_ASSET_ID SOURCE_START_SECONDS DURATION_SECONDS [TIMELINE_START_SECONDS] [PLATFORM].");
        }
        const placed = await runtime.placeMusicExcerpt({
          assetId,
          sourceStartSeconds,
          durationSeconds,
          ...(timelineStartSeconds === undefined ? {} : { timelineStartSeconds }),
          ...(platform ? { platform } : {}),
          commercial: true,
        });
        return commandResult(runtime, command, `${placed.assetId} excerpt placed as ${placed.elementId} at revision ${placed.revision}.`);
      }
      throw new Error("Use /music search QUERY, /music acquire TRACK_ID, /music moments ASSET_ID [DURATION], or /music place ASSET_ID SOURCE_START DURATION [TIMELINE_START] [PLATFORM].");
    }
    case "/brief": {
      if (!argument) {
        const plan = await runtime.getProjectPlan();
        return commandResult(runtime, command, projectPlanText(plan));
      }
      const patch = JSON.parse(argument) as unknown;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Use /brief with a JSON object patch.");
      const plan = await runtime.updateProjectPlan(patch as AttelierProjectPlanPatch);
      return commandResult(runtime, command, `Project plan updated to v${plan.version}.`);
    }
    case "/plan":
    case "/edit": {
      const edit = parseSharedEdit(argument);
      const result = await runtime.planEdit({ ...edit, commit: command === "/edit" });
      const message = result.committedRevision === undefined
        ? `Simulated: ${result.projection.pendingPlan?.summary ?? "plan ready"}. Use /apply to commit.`
        : `Applied project revision ${result.committedRevision}.`;
      return { kind: "command", command, message, projection: result.projection, outcome: result.plan };
    }
    case "/apply": {
      if (argument) throw new Error("/apply does not take arguments.");
      const projection = await runtime.applyPendingPlan();
      return { kind: "command", command, message: `Applied project revision ${projection.projectRevision}.`, projection };
    }
    case "/undo":
    case "/redo":
    case "/restore": {
      const target = command === "/undo" ? "previous" : command === "/redo" ? "redo" : Number(argument);
      if (command === "/restore" && (!argument || !Number.isInteger(target) || Number(target) < 0)) {
        throw new Error("Use /restore with a non-negative project revision.");
      }
      const restored = await runtime.restoreProjectRevision(target as number | "previous" | "redo");
      return { kind: "command", command, message: `Revision ${restored.targetRevision} restored as revision ${restored.revision}.`, projection: restored.projection };
    }
    case "/checkpoint": {
      if (!argument) throw new Error("Use /checkpoint NAME.");
      const checkpoint = await runtime.createCheckpoint(argument);
      return commandResult(runtime, command, `Checkpoint ${String(checkpoint.name)} saved at revision ${String(checkpoint.revision)}.`);
    }
    case "/versions": {
      if (argument) throw new Error("/versions does not take arguments.");
      const listed = await runtime.listProjectVersions();
      const versions = Array.isArray(listed.versions) ? listed.versions : [];
      const lines = [`Current revision ${String(listed.currentRevision)}.`];
      versions.forEach((value) => {
        const version = value && typeof value === "object" ? value as Record<string, unknown> : {};
        lines.push(`r${String(version.revision)} · ${String(version.name)} · ${String(version.id)}`);
      });
      if (versions.length === 0) lines.push("No named checkpoints.");
      return commandResult(runtime, command, lines.join("\n"));
    }
    case "/jobs": {
      if (argument) throw new Error("Use /jobs without arguments in shared chat; recovery continues durably in the backend.");
      const projection = await runtime.projection();
      const message = projection.capabilityJobs.length === 0
        ? "No capability jobs recorded in this session."
        : projection.capabilityJobs.map((job) => `${job.jobId} · ${job.capability} · ${job.status} · ${Math.round(job.progress * 100)}% · ${job.providerId}`).join("\n");
      return { kind: "command", command, message, projection };
    }
    case "/renders": {
      if (argument) throw new Error("Use /renders without arguments in shared chat; active renders update live.");
      const projection = await runtime.projection();
      const message = projection.renderJobs.length === 0
        ? "No render jobs recorded in this session."
        : projection.renderJobs.map((job) => `${job.jobId} · r${job.revision} · ${job.format} · ${job.status} · ${Math.round(job.progress * 100)}%`).join("\n");
      return { kind: "command", command, message, projection };
    }
    case "/history": {
      const limit = argument ? Number(argument) : 20;
      const events = await runtime.history(limit);
      return commandResult(runtime, command, events.map((event) => `${event.sequence}. ${eventLabel(event)}`).join("\n") || "No session events.");
    }
    default:
      throw new Error(`Unknown shared Attelier command ${command}. Use /help.`);
  }
};
