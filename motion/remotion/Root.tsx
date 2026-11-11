import React from "react";
import { Composition } from "remotion";
import { MODEL_COMPARE_EXAMPLE, type ModelCompareSpec, modelCompareDurationSeconds } from "../src/formats/model-compare";
import { SHOOTOUT_EXAMPLE, type ShootoutSpec, shootoutDurationSeconds } from "../src/formats/shootout";
import { ModelCompare } from "./formats/model-compare/ModelCompare";
import { Shootout } from "./formats/shootout/Shootout";
import { Evolution } from "./formats/evolution/Evolution";
import { MAKING_OF_EXAMPLE, type MakingOfSpec, makingOfDurationSeconds } from "../src/formats/making-of";
import { MakingOf } from "./formats/making-of/MakingOf";
import { EVOLUTION_EXAMPLE, type EvolutionSpec, evolutionDurationSeconds } from "../src/formats/evolution";
import { NEWSCAST_EXAMPLE, type NewscastSpec, newscastDurationSeconds } from "../src/formats/newscast";
import { Newscast } from "./formats/newscast/Newscast";
import { ATTELIER_OUTRO_EXAMPLE, type AttelierOutroSpec, attelierOutroDurationSeconds, OUTRO_SIZES } from "../src/formats/attelier-outro";
import { AttelierOutro } from "./formats/attelier-outro/AttelierOutro";

type AnyProps = Record<string, unknown>;

/** Every format is one composition whose props are the format's spec. */
export const Root: React.FC = () => (
  <>
    <Composition
      id="model-compare"
      component={ModelCompare as unknown as React.FC<AnyProps>}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={300}
      defaultProps={MODEL_COMPARE_EXAMPLE as unknown as AnyProps}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as ModelCompareSpec;
        const fps = spec.fps ?? 30;
        return { fps, durationInFrames: Math.round(modelCompareDurationSeconds(spec) * fps) };
      }}
    />
    <Composition
      id="shootout"
      component={Shootout as unknown as React.FC<AnyProps>}
      width={1920}
      height={1080}
      fps={60}
      durationInFrames={600}
      defaultProps={SHOOTOUT_EXAMPLE as unknown as AnyProps}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as ShootoutSpec;
        const fps = spec.fps ?? 60;
        return { fps, durationInFrames: Math.round(shootoutDurationSeconds(spec) * fps) };
      }}
    />
    <Composition
      id="evolution"
      component={Evolution as unknown as React.FC<AnyProps>}
      width={1920}
      height={1080}
      fps={60}
      durationInFrames={600}
      defaultProps={EVOLUTION_EXAMPLE as unknown as AnyProps}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as EvolutionSpec;
        const fps = spec.fps ?? 60;
        return { fps, durationInFrames: Math.round(evolutionDurationSeconds(spec) * fps) };
      }}
    />
    <Composition
      id="making-of"
      component={MakingOf as unknown as React.FC<AnyProps>}
      width={1920}
      height={1080}
      fps={60}
      durationInFrames={600}
      defaultProps={MAKING_OF_EXAMPLE as unknown as AnyProps}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as MakingOfSpec;
        const fps = spec.fps ?? 60;
        return { fps, durationInFrames: Math.round(makingOfDurationSeconds(spec) * fps) };
      }}
    />
    <Composition
      id="newscast"
      component={Newscast as unknown as React.FC<AnyProps>}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={900}
      defaultProps={NEWSCAST_EXAMPLE as unknown as AnyProps}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as NewscastSpec;
        const fps = spec.fps ?? 30;
        return { fps, durationInFrames: Math.round(newscastDurationSeconds(spec) * fps) };
      }}
    />
    <Composition
      id="attelier-outro"
      component={AttelierOutro as unknown as React.FC<AnyProps>}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={54}
      defaultProps={ATTELIER_OUTRO_EXAMPLE as unknown as AnyProps}
      calculateMetadata={({ props }) => {
        const spec = props as unknown as AttelierOutroSpec;
        const fps = spec.fps ?? 30;
        return { fps, ...OUTRO_SIZES[spec.aspect ?? "16x9"], durationInFrames: Math.round(attelierOutroDurationSeconds(spec) * fps) };
      }}
    />
  </>
);
