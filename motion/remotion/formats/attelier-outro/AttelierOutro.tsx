import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import type { AttelierOutroSpec } from "../../../src/formats/attelier-outro";
import { BrandEndCard } from "../../kit/end-card";
import { clamp, easeOut, prog, useTime } from "../../kit/primitives";

const BLACK = "#000000";

/** Logo-only sign-off: warm glow blooms behind the lockup as it sharpens from blur, then holds. */
export const AttelierOutro: React.FC<AttelierOutroSpec> = (spec) => {
  const t = useTime();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const end = durationInFrames / fps;
  const glow = prog(t, 0.05, 0.9, easeOut);
  const fadeOut = interpolate(t, [end - 0.25, end], [1, 0], clamp);
  const short = Math.min(width, height);
  return (
    <AbsoluteFill style={{ background: BLACK }}>
      <AbsoluteFill style={{ opacity: glow * 0.9 * fadeOut, background: `radial-gradient(ellipse ${short * 0.9}px ${short * 0.5}px at 50% 50%, rgba(255,143,68,0.34), rgba(255,200,107,0.10) 45%, rgba(0,0,0,0) 75%)` }} />
      <AbsoluteFill style={{ opacity: fadeOut, transform: `scale(${Math.min(1, width / 1920 * 1.55)})` }}>
        <BrandEndCard at={0} background="transparent" />
      </AbsoluteFill>
      {spec.sting !== false ? (
        <Sequence from={0} durationInFrames={durationInFrames} layout="none">
          <Audio src={staticFile("sfx/logo-sting-dark.mp3")} volume={(frame) => interpolate(frame, [durationInFrames - Math.round(0.3 * fps), durationInFrames], [0.8, 0], clamp)} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
