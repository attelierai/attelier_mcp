import { createContext, useContext } from "react";
import {
  modelCompareDefaults,
  modelCompareTimeline,
  type ModelCompareSpec,
} from "../../../src/formats/model-compare";

export type CompareScene = {
  spec: ModelCompareSpec;
  opts: ReturnType<typeof modelCompareDefaults>;
  T: ReturnType<typeof modelCompareTimeline>;
};

export const buildScene = (spec: ModelCompareSpec): CompareScene => ({
  spec,
  opts: modelCompareDefaults(spec),
  T: modelCompareTimeline(spec.music.beatSeconds),
});

export const SceneContext = createContext<CompareScene | null>(null);
export const useScene = () => {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error("model-compare scene used outside its composition");
  return scene;
};
