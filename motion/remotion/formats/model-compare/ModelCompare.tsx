import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import type { ModelCompareSpec } from "../../../src/formats/model-compare";
import { loadBrandFonts } from "../../brand";
import { CreateDemo } from "../../kit/create-demo";
import { SceneContext, buildScene, type CompareScene } from "./context";
import { Background, Cards, EndCard, Headline, Outro, Race } from "./scenes";

loadBrandFonts();

/** SFX cues from assets/sfx, placed on the scene timeline. */
const sfxCues = ({ spec, T }: CompareScene): { at: number; id: string; volume: number }[] => {
  const max = Math.ceil(Math.max(...spec.models.map((m) => m.genSeconds)) / 30) * 30;
  const fastest = Math.min(...spec.models.map((m) => m.genSeconds));
  return [
    { at: T.headline1 - 0.05, id: "swish", volume: 0.45 },
    { at: T.headline2 - 0.05, id: "glitch", volume: 0.35 },
    { at: T.createIn - 0.15, id: "zoom-whoosh", volume: 0.4 },
    { at: T.typeStart, id: "ui-typing", volume: 0.5 },
    { at: T.modelClick - 0.02, id: "ui-click", volume: 0.8 },
    ...T.checks.map((at) => ({ at: at - 0.02, id: "ui-check", volume: 0.55 })),
    { at: T.send - 0.02, id: "ui-click", volume: 0.9 },
    { at: T.zoomOut + 0.05, id: "zoom-whoosh", volume: 0.55 },
    { at: T.fastDone - 0.05, id: "shimmer", volume: 0.5 },
    { at: T.restDone - 0.05, id: "shimmer", volume: 0.35 },
    { at: T.showcase - 0.2, id: "swish", volume: 0.6 },
    { at: T.showcase, id: "sub-drop", volume: 0.55 },
    ...spec.models.map((_, i) => ({ at: T.showcase + i * T.showcaseLen + 0.6, id: "counter-roll", volume: 0.14 })),
    ...spec.models.slice(1).map((_, i) => ({ at: T.showcase + (i + 1) * T.showcaseLen - T.swap / 2 - 0.08, id: "swish", volume: 0.55 })),
    { at: T.race - T.swap / 2 - 0.08, id: "swish", volume: 0.55 },
    { at: T.race + 1.0, id: "counter-roll", volume: 0.22 },
    { at: T.race + 0.9 + (2.4 * fastest) / max, id: "win-stinger", volume: 0.55 },
    { at: T.outro - 0.1, id: "zoom-whoosh", volume: 0.4 },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ at: T.outro + 0.9 + i * T.beat, id: "ui-check", volume: 0.3 })),
    { at: T.endcard - 0.3, id: "logo-sting", volume: 0.7 },
  ];
};

export const ModelCompare: React.FC<ModelCompareSpec> = (spec) => {
  const { fps } = useVideoConfig();
  const scene = buildScene(spec);
  const { T, opts } = scene;
  const f = (s: number) => Math.round(s * fps);
  const music = spec.music;
  const musicStart = music.firstBeatSeconds + music.offsetBeats * music.beatSeconds;
  const level = music.volume ?? 0.64;
  return (
    <SceneContext.Provider value={scene}>
      <AbsoluteFill>
        <Background />
        <Headline />
        <CreateDemo
          prompt={spec.prompt}
          picks={spec.models.map(({ name, maker }) => ({ name, maker }))}
          extras={opts.pickerExtras}
          summary={`${spec.models.length} videos · 5s`}
          timing={{ ...T, exit: T.showcase }}
        />
        <Cards />
        <Race />
        <Outro />
        <EndCard />
        <Audio
          src={staticFile(music.src)}
          startFrom={f(musicStart)}
          volume={(frame) => interpolate(frame, [0, f(0.25), f(T.endcard), f(T.end)], [0, level, level, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
        />
        {opts.sfx
          ? sfxCues(scene).map((cue, i) => (
            <Sequence key={i} from={f(Math.max(0, cue.at))} durationInFrames={f(3)} layout="none">
              <Audio src={staticFile(`sfx/${cue.id}.mp3`)} volume={cue.volume} />
            </Sequence>
          ))
          : null}
      </AbsoluteFill>
    </SceneContext.Provider>
  );
};
