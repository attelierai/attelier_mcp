// Evolution: worst → best generations of a model, each at its native resolution.
import React from "react";
import { AbsoluteFill, Audio, Freeze, OffthreadVideo, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { type EvolutionEra, type EvolutionSpec, evolutionDefaults, evolutionTimelineFor } from "../../../src/formats/evolution";
import { color, font, loadBrandFonts } from "../../brand";
import { BrandEndCard } from "../../kit/end-card";
import { Slam, plain } from "../../kit/slam";
import { Clip, clamp, easeIn, easeInOut, easeOut, prog, useTime } from "../../kit/primitives";

loadBrandFonts();

const W = 1920, H = 1080;
const DARK = "#0b0b0a";
type Scene = { spec: EvolutionSpec; T: ReturnType<typeof evolutionTimelineFor>; opts: ReturnType<typeof evolutionDefaults> };

/** "FEB 2025" → small brand-mono month beside the big year; plain years pass through. */
const DateSlam: React.FC<{ label: string; at: number; size: number; color?: string }> = ({ label, at, size, color: fill }) => {
  const t = useTime();
  const match = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(label.trim());
  const shadow = { textShadow: "0 4px 28px rgba(0,0,0,0.85)" };
  if (!match) return <Slam text={label} at={at} size={size} style={shadow} {...(fill ? { color: fill } : {})} />;
  const month = prog(t, at + 0.12, 0.3, easeOut);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: size * 0.12 }}>
      <Slam text={match[2]!} at={at} size={size} style={shadow} {...(fill ? { color: fill } : {})} />
      <div style={{ ...shadow, marginTop: size * 0.04, fontFamily: font.mono, fontWeight: 700, fontSize: size * 0.45, letterSpacing: "0.1em", color: color.brand, opacity: month, transform: `translateX(${(1 - month) * -20}px)` }}>{match[1]!.toUpperCase()}</div>
    </div>
  );
};

const Flash: React.FC<{ at: number; len?: number }> = ({ at, len = 0.08 }) => {
  const t = useTime();
  const o = interpolate(t, [at, at + 0.01, at + len], [0, 0.8, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: o }} /> : null;
};

const Scanlines: React.FC<{ opacity: number }> = ({ opacity }) => (
  <AbsoluteFill style={{ opacity, background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, transparent 2px, transparent 5px)", pointerEvents: "none" }} />
);

// --- Hook + rewind -------------------------------------------------------------
const HookAndRewind: React.FC<{ s: Scene }> = ({ s: { spec, T, opts } }) => {
  const t = useTime();
  const { fps } = useVideoConfig();
  const eraStart = T.era(0);
  if (t > eraStart + 0.05) return null;
  const newest = spec.eras.at(-1)!;
  const hookStart = newest.fromSeconds;
  const rewinding = t >= T.rewind;
  // Rewind: media time runs backwards, accelerating, from where the hook stopped to 0.
  const r = prog(t, T.rewind, eraStart - T.rewind - 0.25, easeIn);
  const mediaT = rewinding ? (hookStart + T.rewind) * (1 - r) : hookStart + t;
  const glitch = rewinding ? 0.25 + 0.75 * r : 0;
  const jitter = rewinding ? Math.sin(t * 173) * 14 * glitch : 0;
  // Labels may carry a month ("FEB 2025"); the counter uses the 4-digit year.
  const years = spec.eras.map((e) => Number(/\d{4}/.exec(e.year)?.[0])).filter(Number.isFinite);
  const yearNow = rewinding ? Math.round(interpolate(r, [0, 1], [Math.max(...years), Math.min(...years)])) : Math.max(...years);
  const frame = Math.max(0, Math.round(mediaT * fps));
  const video = (tint?: string, dx = 0) => (
    <AbsoluteFill style={{ transform: `translateX(${dx}px)`, mixBlendMode: tint ? "screen" : undefined, opacity: tint ? 0.55 * glitch : 1 }}>
      <Freeze frame={frame}>
        <OffthreadVideo src={staticFile(newest.video)} muted style={{ width: "100%", height: "100%", objectFit: "cover", filter: tint ? undefined : `saturate(${1 - 0.7 * glitch}) contrast(${1 + 0.2 * glitch})` }} />
      </Freeze>
      {tint ? <AbsoluteFill style={{ background: tint, mixBlendMode: "multiply" }} /> : null}
    </AbsoluteFill>
  );
  const fadeOut = prog(t, eraStart - 0.25, 0.25, easeIn);
  return (
    <AbsoluteFill style={{ background: DARK, opacity: 1 - fadeOut }}>
      <AbsoluteFill style={{ transform: `translateX(${jitter}px) scale(${1 + 0.03 * glitch})` }}>
        {video()}
        {rewinding ? video("#ff2a2a", 10 * glitch) : null}
        {rewinding ? video("#2ad4ff", -10 * glitch) : null}
      </AbsoluteFill>
      <Scanlines opacity={glitch} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 45%)" }} />
      {!rewinding ? (
        <div style={{ position: "absolute", left: 90, bottom: 90 }}>
          <Slam text={opts.hook.title} at={T.b(1)} size={170} />
        </div>
      ) : (
        <>
          <div style={{ position: "absolute", left: 80, top: 70, display: "flex", alignItems: "center", gap: 16, fontFamily: font.mono, fontSize: 34, color: "#fff", letterSpacing: "0.2em", opacity: Math.floor(t * 4) % 2 ? 1 : 0.35 }}>◀◀ REWIND</div>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 260, color: "#fff", letterSpacing: "-0.02em", textShadow: `6px 0 ${color.brand}, -6px 0 #2ad4ff` }}>{yearNow}</div>
            <Slam text={opts.hook.twist} at={T.rewind + T.b(2)} size={84} style={{ marginTop: 10 }} />
          </AbsoluteFill>
        </>
      )}
      <Flash at={T.rewind} len={0.06} />
    </AbsoluteFill>
  );
};

// --- Eras ----------------------------------------------------------------------------
/** On-screen width grows with the generation: the oldest about half the frame (at least its native pixels), the newest full-bleed. */
const eraWidth = (spec: EvolutionSpec, i: number) => {
  const n = spec.eras.length;
  if (i === n - 1) return W;
  const first = Math.min(W * 0.62, Math.max(W * 0.52, spec.eras[0]!.width ?? 0));
  return first + ((W * 0.84 - first) * i) / Math.max(1, n - 2);
};

const Era: React.FC<{ s: Scene; i: number }> = ({ s: { spec, T }, i }) => {
  const t = useTime();
  const start = T.era(i), end = start + T.eraLen;
  if (t < start - 0.3 || t > end + 0.3) return null;
  const era: EvolutionEra = spec.eras[i]!;
  const last = i === spec.eras.length - 1;
  const prevW = i === 0 ? eraWidth(spec, 0) * 0.6 : eraWidth(spec, i - 1);
  const grow = prog(t, start, 0.45, easeOut);
  const w = prevW + (eraWidth(spec, i) - prevW) * grow;
  const aspect = (era.width ?? 16) / (era.height ?? 9);
  const h = last ? H * (w / W) : w / aspect;
  const exit = prog(t, end - 0.12, 0.24, easeInOut);
  const radius = last ? 40 * (1 - grow) : 18;
  const shake = t >= start ? Math.exp(-(t - start) / 0.16) * 10 * Math.sin(t * 91) : 0;
  const factsIn = (k: number) => prog(t, start + 0.25 + k * 0.08, 0.25, easeOut);
  return (
    <AbsoluteFill style={{ background: DARK, opacity: 1 - exit }}>
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      <div style={{ position: "absolute", left: (W - w) / 2 + shake, top: (H - h) / 2, width: w, height: h, borderRadius: radius, overflow: "hidden", boxShadow: last ? "none" : `0 0 0 2px rgba(255,255,255,0.18), 0 40px 120px rgba(0,0,0,0.7)` }}>
        <Clip src={era.video} from={start - 0.3} startAt={Math.max(0, era.fromSeconds - 0.3)} />
        {i === 0 ? <Scanlines opacity={0.25} /> : null}
      </div>
      {last ? <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent 40%), linear-gradient(to bottom, rgba(0,0,0,0.45), transparent 25%)" }} /> : null}
      <div style={{ position: "absolute", left: 80, top: 60 }}>
        <DateSlam label={era.year} at={start + 0.02} size={last ? 190 : 150} color={last ? color.brand : "#fff"} />
      </div>
      <div style={{ position: "absolute", left: 84, bottom: 70 }}>
        <div style={{ fontFamily: font.mono, fontSize: 26, color: color.brand, letterSpacing: "0.3em", opacity: factsIn(0) }}>GEN {String(i + 1).padStart(2, "0")} / {String(spec.eras.length).padStart(2, "0")}</div>
        <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: 110, lineHeight: 0.95, letterSpacing: "-0.03em", color: "#fff", opacity: factsIn(1), transform: `translateX(${(1 - factsIn(1)) * -50}px)` }}>{era.model}</div>
      </div>
      <div style={{ position: "absolute", right: 80, bottom: 84, display: "flex", gap: 14 }}>
        {era.specs.map((fact, k) => (
          <div key={fact} style={{ height: 56, padding: "0 22px", display: "flex", alignItems: "center", fontFamily: font.mono, fontSize: 28, color: "#fff", border: "2px solid rgba(255,255,255,0.35)", background: "rgba(0,0,0,0.45)", opacity: factsIn(k + 2), transform: `translateY(${(1 - factsIn(k + 2)) * 20}px)` }}>{fact.toUpperCase()}</div>
        ))}
      </div>
      <Flash at={start} len={last ? 0.12 : 0.06} />
    </AbsoluteFill>
  );
};

// --- Closing statement ------------------------------------------------------------------
const Closing: React.FC<{ s: Scene }> = ({ s: { spec, T, opts } }) => {
  const t = useTime();
  const closing = opts.closing;
  if (!closing || t < T.closing - 0.05 || t > T.endcard + 0.7) return null;
  const newest = spec.eras.at(-1)!;
  const lines = closing.lines ?? [];
  const push = 1.06 + 0.06 * prog(t, T.closing, T.endcard - T.closing);
  return (
    <AbsoluteFill style={{ background: DARK }}>
      <AbsoluteFill style={{ opacity: 0.32, filter: "blur(18px) saturate(0.8)", transform: `scale(${push})` }}>
        <Clip src={newest.video} from={T.closing} startAt={newest.fromSeconds} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(11,11,10,0.2), rgba(11,11,10,0.85) 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 6 }}>
        {lines.map((line, i) => (
          <Slam key={line} text={line} at={T.closing + T.b(0.5 + i * 2)} size={150} />
        ))}
        {closing.subtitle ? (
          <div style={{ marginTop: 34, fontFamily: font.mono, fontSize: 38, color: "#fff", letterSpacing: "0.12em", opacity: prog(t, T.closing + T.b(0.5 + lines.length * 2), 0.4), transform: `translateY(${(1 - prog(t, T.closing + T.b(0.5 + lines.length * 2), 0.4, easeOut)) * 20}px)` }}>
            {closing.subtitle}
          </div>
        ) : null}
      </AbsoluteFill>
      <Flash at={T.closing} len={0.06} />
    </AbsoluteFill>
  );
};

// --- Finale: all generations side by side ------------------------------------------------
const Finale: React.FC<{ s: Scene }> = ({ s: { spec, T, opts } }) => {
  const t = useTime();
  if (t < T.finale - 0.05 || t > T.closing + 0.05) return null;
  const n = spec.eras.length;
  const cw = W / n;
  return (
    <AbsoluteFill style={{ background: DARK }}>
      {spec.eras.map((era, i) => {
        const p = prog(t, T.finale + i * 0.06, 0.3, easeOut);
        return (
          <div key={era.model} style={{ position: "absolute", left: i * cw, top: 0, width: cw - (i < n - 1 ? 6 : 0), height: H, overflow: "hidden", opacity: p, transform: `translateY(${(1 - p) * 60}px)` }}>
            <Clip src={era.video} from={T.finale} startAt={era.fromSeconds} />
            <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent 40%)" }} />
            <div style={{ position: "absolute", left: 30, bottom: 40 }}>
              <div style={{ fontFamily: font.mono, fontSize: 30, color: i === n - 1 ? color.brand : "rgba(255,255,255,0.75)", letterSpacing: "0.2em" }}>{era.year}</div>
              <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: 56, color: "#fff", letterSpacing: "-0.02em" }}>{era.model}</div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center" }}>
        <Slam text={opts.finale.title} at={T.finale + 0.1} size={Math.min(120, Math.floor(2500 / plain(opts.finale.title).length))} style={{ textShadow: "0 8px 40px rgba(0,0,0,0.85)" }} />
        <div style={{ marginTop: 16, fontFamily: font.mono, fontSize: 32, color: "#fff", letterSpacing: "0.25em", textShadow: "0 4px 20px rgba(0,0,0,0.9)", opacity: prog(t, T.finale + T.b(1), 0.3) }}>{opts.finale.subtitle}</div>
      </div>
      <Flash at={T.finale} len={0.06} />
    </AbsoluteFill>
  );
};

const cues = ({ spec, T }: Scene) => [
  { at: T.b(1) - 0.02, id: "boom-hit", volume: 0.45 },
  { at: T.rewind - 0.02, id: "glitch", volume: 0.6 },
  { at: T.rewind + T.b(2) - 0.02, id: "boom-hit", volume: 0.35 },
  { at: T.era(0) - 2, id: "engine-riser", volume: 0.5 },
  ...spec.eras.flatMap((_, i) => [
    { at: T.era(i) - 0.12, id: "whip", volume: 0.55 },
    { at: T.era(i), id: i === spec.eras.length - 1 ? "boom-hit" : "shutter", volume: 0.55 },
  ]),
  { at: T.era(spec.eras.length - 1) + 0.05, id: "win-stinger", volume: 0.45 },
  { at: T.finale - 0.1, id: "whip", volume: 0.5 },
  ...(evolutionDefaults(spec).closing ? [
    { at: T.closing - 0.02, id: "sub-drop", volume: 0.55 },
    ...(evolutionDefaults(spec).closing!.lines ?? []).map((_, i) => ({ at: T.closing + T.b(0.5 + i * 2) - 0.02, id: "boom-hit", volume: 0.4 })),
  ] : []),
  { at: T.endcard - 0.3, id: "logo-sting-dark", volume: 0.75 },
];

export const Evolution: React.FC<EvolutionSpec> = (spec) => {
  const { fps } = useVideoConfig();
  const s: Scene = { spec, T: evolutionTimelineFor(spec), opts: evolutionDefaults(spec) };
  const { T } = s;
  const f = (sec: number) => Math.round(sec * fps);
  const musicStart = spec.music.firstBeatSeconds + spec.music.offsetBeats * spec.music.beatSeconds;
  const level = spec.music.volume ?? 0.75;
  return (
    <AbsoluteFill style={{ background: DARK }}>
      <HookAndRewind s={s} />
      {spec.eras.map((_, i) => <Era key={i} s={s} i={i} />)}
      <Finale s={s} />
      <Closing s={s} />
      <BrandEndCard at={T.endcard} tagline={s.opts.endcard.tagline} credits={s.opts.endcard.credits} background={DARK} />
      <Audio src={staticFile(spec.music.src)} startFrom={f(musicStart)} volume={(frame) => interpolate(frame, [0, f(0.1), f(T.end - 1), f(T.end)], [0, level, level, 0], clamp)} />
      {cues(s).map((cue, i) => (
        <Sequence key={i} from={f(Math.max(0, cue.at))} durationInFrames={f(3)} layout="none">
          <Audio src={staticFile(`sfx/${cue.id}.mp3`)} volume={cue.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
