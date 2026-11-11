import type { Project, ProjectOperation, TimelineElement } from "@attelier/project-schema";
import type { ColorAnalysisArtifact } from "@attelier/analysis-schema";
import { computeMeasuredColorCorrection } from "@attelier/capability-schema/color-matching";
import { activeProjectSequence, locateProjectElement } from "@atte/kit/project-tool-utils";

export class ColorMatchPlanError extends Error {}

const visual = (element: TimelineElement): boolean =>
  element.kind === "video" || element.kind === "image";

export const resolveColorReference = (
  project: Project,
  targetId: string,
  referenceId?: string,
): TimelineElement => {
  const target = locateProjectElement(project, targetId);
  if (!target || !visual(target.element)) {
    throw new ColorMatchPlanError("Color matching needs a visual target clip.");
  }
  if (referenceId) {
    const reference = locateProjectElement(project, referenceId);
    if (!reference || !visual(reference.element) || reference.element.id === targetId) {
      throw new ColorMatchPlanError("The color reference must be a different visual clip.");
    }
    return reference.element;
  }
  const sequence = activeProjectSequence(project);
  const visualElements = sequence?.tracks
    .filter((track) => !track.hidden)
    .flatMap((track) => track.elements)
    .filter(visual)
    .sort((left, right) => Number(left.timelineRange.start) - Number(right.timelineRange.start)) ?? [];
  const targetIndex = visualElements.findIndex((element) => element.id === targetId);
  const reference = targetIndex > 0 ? visualElements[targetIndex - 1] : visualElements[targetIndex + 1];
  if (!reference) throw new ColorMatchPlanError("Add another visual clip to use as the color reference.");
  return reference;
};

/** Mark a target for two-pass render analysis against a stable reference clip. */
export const buildColorMatchOperations = (
  project: Project,
  targetId: string,
  referenceId?: string,
): ProjectOperation[] => {
  const target = locateProjectElement(project, targetId);
  if (!target || !visual(target.element)) {
    throw new ColorMatchPlanError("Color matching needs a visual target clip.");
  }
  const reference = resolveColorReference(project, targetId, referenceId);
  return [
    { type: "setProperty", elementId: targetId, path: "color.match.mode", value: "reference-frame" },
    { type: "setProperty", elementId: targetId, path: "color.match.referenceElementId", value: reference.id },
  ];
};

export type MeasuredColorMatchPlan = {
  operations: ProjectOperation[];
  targetElementId: string;
  referenceElementId: string;
  strength: number;
  distanceBefore: number;
  distanceAfter: number;
};

/** Author the measured correction directly. Rendering never needs to sample a
 * second time, so preview and export consume the same revision-pinned values. */
export const buildMeasuredColorMatchOperations = (
  project: Project,
  targetId: string,
  referenceId: string,
  strength: number,
  evidenceForAsset: (assetId: string) => ColorAnalysisArtifact | undefined,
): MeasuredColorMatchPlan => {
  const target = locateProjectElement(project, targetId)?.element;
  const reference = resolveColorReference(project, targetId, referenceId);
  if (!target?.assetId || !reference.assetId) {
    throw new ColorMatchPlanError("Color matching needs target and reference clips with media assets.");
  }
  const targetEvidence = evidenceForAsset(target.assetId);
  const referenceEvidence = evidenceForAsset(reference.assetId);
  if (!targetEvidence || !referenceEvidence) {
    const missing = [
      ...(!targetEvidence ? [target.assetId] : []),
      ...(!referenceEvidence ? [reference.assetId] : []),
    ];
    throw new ColorMatchPlanError(`Color measurement is missing for asset${missing.length === 1 ? "" : "s"} ${missing.join(", ")}. Wait for import analysis before matching.`);
  }
  const correction = computeMeasuredColorCorrection(targetEvidence, referenceEvidence, strength);
  return {
    targetElementId: target.id,
    referenceElementId: reference.id,
    strength,
    distanceBefore: correction.before.distance,
    distanceAfter: correction.after.distance,
    operations: [
      { type: "setProperty", elementId: target.id, path: "color.exposure", value: correction.exposure },
      { type: "setProperty", elementId: target.id, path: "color.temperatureShift", value: correction.temperatureShift },
      { type: "setProperty", elementId: target.id, path: "color.tintShift", value: correction.tintShift },
      { type: "setProperty", elementId: target.id, path: "color.saturation", value: correction.saturation },
      { type: "setProperty", elementId: target.id, path: "color.match.referenceElementId", value: reference.id },
      { type: "setProperty", elementId: target.id, path: "color.match.strength", value: strength },
      { type: "setProperty", elementId: target.id, path: "color.match.distanceBefore", value: correction.before.distance },
      { type: "setProperty", elementId: target.id, path: "color.match.distanceAfter", value: correction.after.distance },
    ],
  };
};
