/** App-facing entrypoint: source types use portable .js module specifiers. */
export { renderComposition, type CompositionRenderRequest } from "./composition-sandbox.js";
export { validateComposition, compositionFrames, type MotionComposition, type MotionRenderMode } from "./composition.js";
