// The shared motion vocabulary: clock, easing, springs, kinetic type, clips.
import React from "react";
import { Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.in(Easing.cubic);

/** Seconds on the composition clock (frame-rate independent). */
export const useTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

/** 0→1 progress over [from, from + dur] with an easing. */
export const prog = (t: number, from: number, dur: number, ease: (n: number) => number = easeInOut) =>
  interpolate(t, [from, from + dur], [0, 1], { ...clamp, easing: ease });

export type SpringConfig = { damping?: number; stiffness?: number; mass?: number };
/** Spring that starts at `from` seconds. */
export const useSpring = (from: number, config: SpringConfig = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - Math.round(from * fps), fps, config: { damping: 18, stiffness: 140, mass: 0.9, ...config } });
};

/** Per-letter blur-in reveal. `letterColor` accents individual characters. */
export const BlurText: React.FC<{
  text: string;
  at: number;
  stagger?: number;
  dur?: number;
  style?: React.CSSProperties;
  letterColor?: (index: number) => string | undefined;
}> = ({ text, at, stagger = 0.022, dur = 0.5, style, letterColor }) => {
  const t = useTime();
  return (
    <span style={{ display: "inline-block", whiteSpace: "pre", ...style }}>
      {[...text].map((ch, i) => {
        const p = prog(t, at + i * stagger, dur, easeOut);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: letterColor?.(i),
              opacity: p,
              filter: `blur(${(1 - p) * 14}px)`,
              transform: `translateY(${(1 - p) * 0.35}em) scale(${0.96 + 0.04 * p})`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
};

/** 3.7s · 41s · 2m 50s: generation times at a glance. */
export const formatSeconds = (s: number) => {
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 120) return `${Math.round(s)}s`;
  const total = Math.round(s);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
};

export type Rect = { x: number; y: number; w: number; h: number; r: number };
export const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({
  x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p, r: a.r + (b.r - a.r) * p,
});

/** A rounded media card at an absolute rect. */
export const Frame: React.FC<{ rect: Rect; style?: React.CSSProperties; children: React.ReactNode }> = ({ rect, style, children }) => (
  <div
    style={{
      position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r, overflow: "hidden",
      background: "#111", boxShadow: "0 30px 80px rgba(30,25,10,0.22)", ...style,
    }}
  >
    {children}
  </div>
);

/** A clip whose media time `startAt` plays when the composition reaches `from` seconds. */
export const Clip: React.FC<{ src: string; from: number; startAt: number; zoom?: number; volume?: number; rate?: number; style?: React.CSSProperties }> = ({ src, from, startAt, zoom = 1, volume = 0, rate = 1, style }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(from * fps)} layout="none">
      <OffthreadVideo
        src={staticFile(src)}
        muted={volume <= 0}
        volume={volume}
        startFrom={Math.round(startAt * fps)}
        playbackRate={rate}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, ...style }}
      />
    </Sequence>
  );
};
