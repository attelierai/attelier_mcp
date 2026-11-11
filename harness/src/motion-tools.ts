/**
 * Motion presets — the "After Effects moves" everyone actually uses, written as
 * transform keyframe channels. No model, no cost: each preset is a pure function
 * from an element + its duration to a `replaceElement` op that (re)writes the
 * transform.* channels the compositor already animates (scale, position,
 * rotation, opacity). Detection is chat-first ("dale un ken burns al clip").
 */

import type { AnimationChannel, Keyframe, ProjectOperation, TimelineElement } from "@attelier/project-schema";
import { TICKS_PER_SECOND } from "@attelier/project-schema";

export type MotionPreset =
  | "ken-burns"
  | "drift-in"
  | "drift-out"
  | "pan-left"
  | "pan-right"
  | "push"
  | "zoom-in"
  | "zoom-out"
  | "punch"
  | "shake"
  | "fade-in"
  | "fade-out"
  | "fade"
  | "slide-in"
  | "spin";

/**
 * The deterministic shot-motion set: soft zoom in/out, lateral pans both ways,
 * a more marked push. `motionForShot` assigns one per shot index so adjacent
 * shots never repeat the same move (same input → same output, no randomness).
 */
export const SHOT_MOTION_CYCLE: readonly MotionPreset[] = ["drift-in", "pan-left", "drift-out", "pan-right", "push"];

export const motionForShot = (shotIndex: number): MotionPreset => {
  const length = SHOT_MOTION_CYCLE.length;
  const index = ((Math.trunc(shotIndex) % length) + length) % length;
  return SHOT_MOTION_CYCLE[index]!;
};

const kf = (id: string, atSeconds: number, value: unknown, easing: Keyframe["easing"] = "easeInOut"): Keyframe => ({
  id,
  at: String(Math.round(atSeconds * TICKS_PER_SECOND)) as Keyframe["at"],
  value,
  easing,
});

/** Build the transform channels for a preset over a clip of `duration` seconds. */
const channelsFor = (preset: MotionPreset, elementId: string, duration: number): AnimationChannel[] => {
  const d = Math.max(0.1, duration);
  const id = (path: string, i: number) => `${elementId}-${path}-${i}`;
  // COVERAGE RULE — any preset that moves the image off centre must over-scale
  // enough that the frame stays covered at EVERY keyframe: an offset `o` from
  // centre (normalized position 0.5±o) needs scale >= 1/(1-2*o), plus margin.
  // A pan at scale 1.0 (or a jitter without over-scale) uncovers black borders.
  switch (preset) {
    case "ken-burns":
      // Max offset 0.04 needs scale >= 1.087 — start already over-scaled at
      // 1.12 so the pan never reveals an edge, and zoom into 1.28.
      return [
        { path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.12), kf(id("s", 1), d, 1.28)] },
        {
          path: "transform.position",
          keyframes: [kf(id("p", 0), 0, [0.46, 0.47]), kf(id("p", 1), d, [0.54, 0.53])],
        },
      ];
    case "drift-in":
      return [{ path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.0), kf(id("s", 1), d, 1.08)] }];
    case "drift-out":
      return [{ path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.1), kf(id("s", 1), d, 1.0)] }];
    case "pan-left":
      // Offset 0.045 needs scale >= 1.099 — 1.18 keeps ~4% covered margin so
      // the lateral travel can never expose a border.
      return [
        { path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.18, "linear"), kf(id("s", 1), d, 1.18, "linear")] },
        { path: "transform.position", keyframes: [kf(id("p", 0), 0, [0.455, 0.5]), kf(id("p", 1), d, [0.545, 0.5])] },
      ];
    case "pan-right":
      return [
        { path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.18, "linear"), kf(id("s", 1), d, 1.18, "linear")] },
        { path: "transform.position", keyframes: [kf(id("p", 0), 0, [0.545, 0.5]), kf(id("p", 1), d, [0.455, 0.5])] },
      ];
    case "push":
      return [{ path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.0, "easeIn"), kf(id("s", 1), d, 1.24, "easeIn")] }];
    case "zoom-in":
      return [{ path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.0, "easeOut"), kf(id("s", 1), d, 1.4, "easeOut")] }];
    case "zoom-out":
      return [{ path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.4, "easeOut"), kf(id("s", 1), d, 1.0, "easeOut")] }];
    case "punch":
      return [
        {
          path: "transform.scale",
          keyframes: [
            kf(id("s", 0), 0, 1.0, "easeOut"),
            kf(id("s", 1), Math.min(0.18, d * 0.25), 1.28, "easeOut"),
            kf(id("s", 2), Math.min(0.5, d * 0.55), 1.0, "easeInOut"),
          ],
        },
      ];
    case "shake": {
      // Fast positional jitter around center for the first ~1.2s (or the clip).
      const span = Math.min(1.2, d);
      const steps = 8;
      const offsets = [0.012, -0.014, 0.01, -0.008, 0.011, -0.01, 0.006, 0];
      return [
        // Jitter offset 0.014 needs scale >= 1.03 — hold 1.06 so the shake
        // never uncovers an edge.
        { path: "transform.scale", keyframes: [kf(id("s", 0), 0, 1.06, "linear"), kf(id("s", 1), d, 1.06, "linear")] },
        {
          path: "transform.position",
          keyframes: offsets.slice(0, steps).map((dx, i) =>
            kf(id("p", i), (span * i) / (steps - 1), [0.5 + dx, 0.5 - dx * 0.7], "linear"),
          ),
        },
      ];
    }
    case "fade-in": {
      const t = Math.min(1, d / 3);
      return [{ path: "transform.opacity", keyframes: [kf(id("o", 0), 0, 0, "easeOut"), kf(id("o", 1), t, 1, "easeOut")] }];
    }
    case "fade-out": {
      const t = Math.min(1, d / 3);
      return [{ path: "transform.opacity", keyframes: [kf(id("o", 0), Math.max(0, d - t), 1, "easeIn"), kf(id("o", 1), d, 0, "easeIn")] }];
    }
    case "fade": {
      const t = Math.min(0.8, d / 3);
      return [
        {
          path: "transform.opacity",
          keyframes: [
            kf(id("o", 0), 0, 0, "easeOut"),
            kf(id("o", 1), t, 1, "easeOut"),
            kf(id("o", 2), Math.max(t + 0.05, d - t), 1, "easeIn"),
            kf(id("o", 3), d, 0, "easeIn"),
          ],
        },
      ];
    }
    case "slide-in": {
      const t = Math.min(0.8, d / 2);
      return [
        {
          path: "transform.position",
          keyframes: [kf(id("p", 0), 0, [-0.25, 0.5], "easeOut"), kf(id("p", 1), t, [0.5, 0.5], "easeOut")],
        },
        {
          path: "transform.opacity",
          keyframes: [kf(id("o", 0), 0, 0, "easeOut"), kf(id("o", 1), t * 0.7, 1, "easeOut")],
        },
      ];
    }
    case "spin":
      return [{ path: "transform.rotation", keyframes: [kf(id("r", 0), 0, 0, "linear"), kf(id("r", 1), d, 360, "linear")] }];
  }
};

/**
 * Emit a single replaceElement that merges the preset's channels into the
 * element — replacing any channel on the same path so re-applying is idempotent.
 */
export const buildMotionOperations = (
  element: TimelineElement,
  preset: MotionPreset,
  durationSeconds: number,
): ProjectOperation[] => {
  const channels = channelsFor(preset, element.id, durationSeconds);
  const touched = new Set(channels.map((channel) => channel.path));
  const draft = structuredClone(element);
  draft.keyframes = [...draft.keyframes.filter((channel) => !touched.has(channel.path)), ...channels];
  // Record the applied preset so the planner snapshot and the sequence critic
  // can see (and vary) the motion treatment between neighboring shots.
  const properties: Record<string, unknown> = { ...draft.properties, "motion.preset": preset };
  // The visible Studio presets are all members of Attelier's deterministic
  // Ken-Burns/slow-zoom effect contract. Pin that lineage so post-render QC
  // measures the encoded movement instead of reporting it not applicable.
  // Clear only our own prior lineage when another motion family replaces it.
  if (preset === "ken-burns" || preset === "drift-in" || preset === "drift-out") {
    properties["effect.motion.id"] = "atelier.motion.ken-burns";
    properties["effect.motion.version"] = 1;
  } else if (properties["effect.motion.id"] === "atelier.motion.ken-burns") {
    delete properties["effect.motion.id"];
    delete properties["effect.motion.version"];
  }
  draft.properties = properties;
  return [{ type: "replaceElement", elementId: element.id, element: draft }];
};
