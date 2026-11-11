// Making-of: the result as hook → the real screen recording of the whole process,
// sped up with a following camera and section titles → optional result card → end card.
import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { type MakingOfSpec, makingOfTimeline } from "../../../src/formats/making-of";
import { color, font, loadBrandFonts } from "../../brand";
import { BrandEndCard } from "../../kit/end-card";
import { Clip, clamp, easeInOut, easeOut, prog, useTime } from "../../kit/primitives";
import { Slam } from "../../kit/slam";

loadBrandFonts();

const W = 1920, H = 1080;
type Timeline = ReturnType<typeof makingOfTimeline>;

/** A section visible in [from, to) with a short blur-fade at both ends. */
const Section: React.FC<{ from: number; to: number; children: React.ReactNode; fade?: number; blur?: boolean; rise?: boolean }> = ({ from, to, children, fade = 0.35, blur = true, rise = false }) => {
  const t = useTime();
  if (t < from - 0.01 || t > to + fade) return null;
  const inP = prog(t, from, fade, easeOut);
  const outP = prog(t, to, fade, easeInOut);
  return <AbsoluteFill style={{ opacity: inP * (1 - outP), filter: blur ? `blur(${(1 - inP) * 10 + outP * 10}px)` : undefined, transform: rise ? `scale(${0.965 + 0.035 * inP})` : undefined }}>{children}</AbsoluteFill>;
};

const Hook: React.FC<{ spec: MakingOfSpec; T: Timeline }> = ({ spec, T }) => {
  const t = useTime();
  const dim = interpolate(t, [0.9, 1.4], [0, 0.55], clamp);
  return (
    <Section from={0} to={T.screen - 0.45} fade={0.4} blur={false}>
      <AbsoluteFill style={{ background: "#000" }}>
        <Clip src={spec.result.video} from={0} startAt={spec.result.hookFrom} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {spec.hook?.overline ? (
          <div style={{ fontFamily: font.mono, fontSize: 30, letterSpacing: "0.42em", color: color.brand, marginBottom: 22, paddingLeft: "0.42em", opacity: prog(t, 1.0, 0.4, easeOut), transform: `translateY(${(1 - prog(t, 1.0, 0.4, easeOut)) * 12}px)`, textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}>
            {spec.hook.overline}
          </div>
        ) : null}
        <Slam text={spec.hook?.title ?? "HOW WE MADE [THIS]"} at={1.1} size={150} style={{ textShadow: "0 8px 40px rgba(0,0,0,0.8)", textAlign: "center" }} />
      </AbsoluteFill>
    </Section>
  );
};

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/** The screen recording: each segment at its own speed, the camera easing to each segment's focus. */
const Screen: React.FC<{ spec: MakingOfSpec; T: Timeline }> = ({ spec, T }) => {
  const t = useTime();
  const { fps } = useVideoConfig();
  const segs = T.segments;
  const i = Math.max(0, segs.findLastIndex((s) => t >= s.start));
  const seg = segs[i]!;
  const view = (f?: { x: number; y: number; w: number; h: number }) => {
    if (!f) return { s: 0.9, x: (W - W * 0.9) / 2, y: (H - H * 0.9) / 2 };
    const s = Math.min((W * 0.94) / f.w, (H * 0.94) / f.h);
    return { s, x: W / 2 - (f.x + f.w / 2) * s, y: H / 2 - (f.y + f.h / 2) * s };
  };
  const a = view(segs[i - 1]?.focus ?? seg.focus), b = view(seg.focus);
  const p = i === 0 ? 1 : prog(t, seg.start, 0.8, easeInOut);
  const cam = { s: a.s + (b.s - a.s) * p, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
  const source = seg.from + (t - seg.start) * seg.speed;
  const zero = seg.clockZero;
  const titleP = seg.title ? Math.min(prog(t, seg.start + 0.1, 0.45, easeOut), 1 - prog(t, seg.start + seg.seconds - 0.5, 0.4, easeInOut)) : 0;
  const fast = seg.speed >= 1.5;
  const xfade = spec.screen.crossfade ?? 0.35;
  return (
    <Section from={T.screen} to={T.finale} fade={0.45} blur={false} rise>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #2b2a24 0%, ${color.night} 70%)` }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`, borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.55)" }}>
        {/* Each segment keeps playing under the next one while it dissolves in, so cuts between moments read as one take. */}
        {segs.map((s, k) => {
          const fadeIn = k === 0 ? 0 : xfade;
          return (
            <Sequence key={k} from={Math.round(s.start * fps)} durationInFrames={Math.max(1, Math.round((s.seconds + (k < segs.length - 1 ? xfade : 0)) * fps))} layout="none">
              <AbsoluteFill style={{ opacity: fadeIn ? Math.min(1, (t - s.start) / fadeIn) : 1 }}>
                <OffthreadVideo src={staticFile(spec.screen.video)} muted startFrom={Math.round(s.from * fps)} playbackRate={s.speed} style={{ width: W, height: H }} />
              </AbsoluteFill>
            </Sequence>
          );
        })}
      </div>
      <div style={{ position: "absolute", right: 40, top: 36, display: "flex", gap: 10, fontFamily: font.mono, fontSize: 22, letterSpacing: "0.04em" }}>
        {zero !== undefined && source >= zero ? <div style={{ padding: "8px 16px", borderRadius: 999, background: "rgba(20,20,16,0.82)", color: "#fff", backdropFilter: "blur(8px)" }}>⏱ {clock(source - zero)}</div> : null}
        {fast ? <div style={{ padding: "8px 16px", borderRadius: 999, background: color.brand, color: "#1c1c18", fontWeight: 700 }}>▶▶ {Math.round(seg.speed)}×</div> : null}
      </div>
      {seg.title ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(20,20,16,${0.35 * titleP})` }}>
          <div style={{ padding: "22px 44px", borderRadius: 28, background: "rgba(20,20,16,0.88)", color: "#fff", fontFamily: font.display, fontWeight: 700, fontSize: 96, letterSpacing: "-0.035em", opacity: titleP, transform: `scale(${0.92 + 0.08 * titleP})`, filter: `blur(${(1 - titleP) * 8}px)`, boxShadow: "0 30px 90px rgba(0,0,0,0.45)" }}>
            {seg.title}
          </div>
        </AbsoluteFill>
      ) : null}
      {seg.caption ? (
        <div key={i} style={{ position: "absolute", left: 40, bottom: 40, padding: "12px 22px", borderRadius: 14, background: "rgba(20,20,16,0.86)", color: "#fff", fontFamily: font.ui, fontWeight: 600, fontSize: 30, letterSpacing: "-0.01em", backdropFilter: "blur(8px)", opacity: prog(t, seg.start + 0.15, 0.35, easeOut), transform: `translateY(${(1 - prog(t, seg.start + 0.15, 0.35, easeOut)) * 14}px)` }}>
          {seg.caption}
        </div>
      ) : null}
    </Section>
  );
};

/** The result as a card, its numbers underneath. */
const Finale: React.FC<{ spec: MakingOfSpec; T: Timeline }> = ({ spec, T }) => {
  const t = useTime();
  if (!spec.finale) return null;
  const card = prog(t, T.finale, 0.6, easeOut);
  const w = 1440, h = 810;
  return (
    <Section from={T.finale} to={T.endcard} fade={0.35}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #2b2a24 0%, ${color.night} 70%)` }} />
      <div style={{ position: "absolute", left: (W - w) / 2, top: 50, width: w, height: h, borderRadius: 22, overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.6)", transform: `scale(${0.94 + 0.06 * card})` }}>
        <Clip src={spec.result.video} from={T.finale} startAt={spec.result.finaleFrom} volume={0} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 50 + h + 50, display: "flex", justifyContent: "center", gap: 18 }}>
        {spec.finale.stats.map((stat, k) => {
          const p = prog(t, T.finale + 0.5 + k * 0.3, 0.4, easeOut);
          return (
            <div key={stat} style={{ padding: "12px 26px", borderRadius: 16, background: k === 0 ? color.brand : "rgba(255,255,255,0.1)", color: k === 0 ? "#1c1c18" : "#fff", border: k === 0 ? "none" : "1px solid rgba(255,255,255,0.22)", fontFamily: font.ui, fontWeight: 700, fontSize: 38, letterSpacing: "-0.02em", opacity: p, transform: `translateY(${(1 - p) * 24}px) scale(${0.94 + 0.06 * p})` }}>
              {stat}
            </div>
          );
        })}
      </div>
    </Section>
  );
};


/** Spoken captions. "subtitle" (default): one phrase at a time, quiet, lower centre. "karaoke": CapCut style, the word being said lit. */
const Captions: React.FC<{ spec: MakingOfSpec }> = ({ spec }) => {
  const t = useTime();
  const karaoke = spec.captions === "karaoke";
  for (const line of spec.voice) {
    if (!line.words?.length) continue;
    const local = t - line.at;
    if (local < line.words[0]!.start - 0.05 || local > line.words.at(-1)!.end + 0.3) continue;
    // Phrases: break after punctuation, at most 4 words (karaoke) or 9 (subtitle).
    const max = karaoke ? 4 : 9;
    const chunks: (typeof line.words)[] = [];
    let chunk: typeof line.words = [];
    for (const w of line.words) {
      chunk.push(w);
      if (chunk.length === max || /[.,:;?!]$/.test(w.text) && (karaoke || chunk.length >= 3)) { chunks.push(chunk); chunk = []; }
    }
    if (chunk.length) chunks.push(chunk);
    const current = chunks.find((c) => local <= c.at(-1)!.end + 0.12) ?? chunks.at(-1)!;
    const enter = prog(local, current[0]!.start - 0.05, karaoke ? 0.14 : 0.2, easeOut);
    if (!karaoke) return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 118, pointerEvents: "none" }}>
        <div style={{ maxWidth: 1300, padding: "12px 26px", borderRadius: 14, background: "rgba(16,16,13,0.74)", backdropFilter: "blur(8px)", textAlign: "center", fontFamily: font.ui, fontWeight: 500, fontSize: 40, lineHeight: 1.3, letterSpacing: "-0.01em", color: "#fff", opacity: enter }}>
          {current.map((w) => w.text).join(" ")}
        </div>
      </AbsoluteFill>
    );
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 440, pointerEvents: "none" }}>
        <div style={{ maxWidth: 1500, textAlign: "center", fontFamily: font.display, fontWeight: 800, fontSize: 76, lineHeight: 1.08, letterSpacing: "-0.02em", color: "#fff", transform: `scale(${0.92 + 0.08 * enter})`, opacity: enter, WebkitTextStroke: "10px #000", paintOrder: "stroke fill", textShadow: "0 6px 24px rgba(0,0,0,0.55)" }}>
          {current.map((w, i) => (
            <span key={i} style={{ color: local >= w.start - 0.02 && local <= w.end + 0.06 ? color.brand : "#fff" }}>{w.text}{i < current.length - 1 ? " " : ""}</span>
          ))}
        </div>
      </AbsoluteFill>
    );
  }
  return null;
};

export const MakingOf: React.FC<MakingOfSpec> = (spec) => {
  const { fps } = useVideoConfig();
  const T = makingOfTimeline(spec);
  const f = (s: number) => Math.round(s * fps);
  // 0 → 1 while a voice line plays, with short ramps so the bed never jumps.
  const duck = (s: number) => Math.max(0, ...spec.voice.map((v) => interpolate(s, [v.at - 0.25, v.at, v.at + (v.seconds ?? 3), v.at + (v.seconds ?? 3) + 0.4], [0, 1, 1, 0], clamp)));
  const base = spec.music.volume ?? 0.3;
  return (
    <AbsoluteFill style={{ background: color.night }}>
      <Hook spec={spec} T={T} />
      <Screen spec={spec} T={T} />
      <Finale spec={spec} T={T} />
      <Captions spec={spec} />
      <BrandEndCard at={T.endcard} tagline={spec.endcard?.tagline ?? ["Claude Opus 5.5", "Attelier Studio"]} {...(spec.endcard?.cta ? { cta: spec.endcard.cta } : {})} credits={spec.endcard?.credits ?? []} />
      {/* The result's own soundtrack opens the piece; the music bed ducks under the voice. */}
      <Sequence from={0} durationInFrames={f(T.screen)} layout="none">
        {/* The result's track punches in and fades away as the title lands. */}
        <Audio src={staticFile(spec.result.video)} startFrom={f(spec.result.hookFrom)} volume={(fr) => interpolate(fr / fps, [0, 1.0, Math.min(T.screen - 0.2, 2.6)], [0.9, 0.9, 0], clamp)} />
      </Sequence>
      <Sequence from={f(T.screen)} layout="none">
        <Audio
          src={staticFile(spec.music.src)}
          startFrom={f(spec.music.fromSeconds ?? 0)}
          volume={(fr) => {
            const s = fr / fps + T.screen;
            const fadeIn = interpolate(s, [T.screen, T.screen + 0.6], [0, 1], clamp);
            // The bed is gone before the end card, so the last line lands on silence.
            const fadeOut = interpolate(s, [T.endcard - 2.5, T.endcard - 0.3], [1, 0], clamp);
            return base * (1 - 0.8 * duck(s)) * fadeIn * fadeOut;
          }}
        />
      </Sequence>
      {spec.voice.map((v, k) => (
        <Sequence key={k} from={f(v.at)} layout="none">
          <Audio src={staticFile(v.src)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
