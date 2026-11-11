export type SchedulableToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};
const rank = (name: string): number => {
  if (name === "set_format") return 0;
  if (
    [
      "trim_clip",
      "move_clip",
      "set_speed",
      "split_clip",
      "delete_clip",
      "duplicate_clip",
    ].includes(name)
  )
    return 1;
  // Supplied media must exist before a transition can resolve its element ids.
  // This also lets one LLM response describe a complete assembly atomically.
  if (["place_asset", "add_overlay", "replace_clip_media"].includes(name))
    return 2;
  if (["apply_transition", "apply_split_edit"].includes(name)) return 3;
  if (name === "add_title") return 4;
  if (name === "edit_title") return 5;
  if (["polish_quality", "critique_project", "export_video"].includes(name))
    return 9;
  return 6;
};

const resources = (call: SchedulableToolCall): Set<string> => {
  const args = call.arguments;
  const result = new Set<string>();
  if (call.name === "set_format") result.add("global:canvas");
  const elementId =
    typeof args.element_id === "string" ? args.element_id : undefined;
  if (elementId) result.add(`element:${elementId}`);
  if (call.name === "apply_transition" || call.name === "apply_split_edit") {
    result.add(`element:${String(args.outgoing_element_id ?? "unknown")}`);
    result.add(`element:${String(args.incoming_element_id ?? "unknown")}`);
    result.add("global:timeline");
  }
  if (
    call.name === "move_clip" ||
    call.name === "trim_clip" ||
    call.name === "split_clip" ||
    call.name === "delete_clip" ||
    call.name === "duplicate_clip"
  )
    result.add("global:timeline");
  if (call.name === "place_asset") result.add("track:audio-or-media");
  if (call.name === "add_overlay") result.add("layout:overlay");
  if (call.name === "add_title" || call.name === "edit_title")
    result.add("layout:title");
  if (
    ["polish_quality", "critique_project", "export_video"].includes(call.name)
  )
    result.add("global:finalize");
  return result;
};

const conflicts = (left: Set<string>, right: Set<string>): boolean => {
  if (left.has("global:finalize") || right.has("global:finalize")) return true;
  if (left.has("global:canvas") || right.has("global:canvas")) return true;
  if (left.has("global:timeline") && right.has("global:timeline")) return true;
  if (
    (left.has("layout:overlay") && right.has("layout:title")) ||
    (left.has("layout:title") && right.has("layout:overlay"))
  )
    return true;
  return [...left].some((resource) => right.has(resource));
};

/** Stable dependency schedule for a tool batch; execution must apply phases in order. */
export const scheduleToolCalls = <T extends SchedulableToolCall>(
  calls: T[],
): { phases: T[][]; serializedCount: number; parallelizedCount: number } => {
  const ordered = calls
    .map((call, index) => ({ call, index }))
    .sort(
      (left, right) =>
        rank(left.call.name) - rank(right.call.name) ||
        left.index - right.index,
    );
  const phases: T[][] = [];
  for (const { call } of ordered) {
    const callResources = resources(call);
    const phase = phases.find(
      (candidate) =>
        candidate.every(
          (existing) => !conflicts(callResources, resources(existing)),
        ) &&
        candidate.every((existing) => rank(existing.name) === rank(call.name)),
    );
    if (phase) phase.push(call);
    else phases.push([call]);
  }
  return {
    phases,
    serializedCount: phases.length,
    parallelizedCount: calls.length - phases.length,
  };
};
