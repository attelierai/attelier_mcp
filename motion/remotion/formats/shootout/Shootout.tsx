// Shootout: several shots by four models, dark HUD look, every cut on the beat.
import React from "react";
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { type ShootoutSpec, shootoutDefaults, shootoutTimelineFor, shootoutTotals } from "../../../src/formats/shootout";
import { color, font, loadBrandFonts } from "../../brand";
import { BrandEndCard } from "../../kit/end-card";
import { Clip, clamp, easeInOut, easeOut, formatSeconds, prog, useTime } from "../../kit/primitives";

loadBrandFonts();

const W = 1920, H = 1080;
const DARK = "#0b0b0a";
const HUD = "rgba(255,255,255,0.86)";

/** Index of the last element passing `test`, or -1. */
const lastIndex = <T,>(items: readonly T[], test: (item: T, index: number) => boolean) => {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i]!, i)) return i;
  return -1;
};

/** Decaying jitter after a hit: camera shake without randomness. */
const shake = (t: number, at: number, amp = 14) => {
  const k = t < at ? 0 : Math.exp(-(t - at) / 0.14);
  return { x: amp * k * Math.sin(t * 93), y: amp * k * Math.cos(t * 71) };
};

/** Heavy uppercase slam: oversized, blurred, settles in ~0.18 s. */
const Slam: React.FC<{ text: string; at: number; size: number; color?: string; style?: React.CSSProperties }> = ({ text, at, size, color: fill = "#fff", style }) => {
  const t = useTime();
  const p = prog(t, at, 0.18, easeOut);
  if (t < at) return null;
  return (
    <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: size, lineHeight: 0.9, letterSpacing: "-0.04em", textTransform: "uppercase", color: fill, opacity: Math.min(1, p * 2), filter: `blur(${(1 - p) * 16}px)`, transform: `scale(${1.35 - 0.35 * p})`, ...style }}>
      {text}
    </div>
  );
};

const Flash: React.FC<{ at: number; len?: number }> = ({ at, len = 0.09 }) => {
  const t = useTime();
  const o = interpolate(t, [at, at + 0.01, at + len], [0, 0.85, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: o }} /> : null;
};

const Brackets: React.FC<{ inset?: number; size?: number }> = ({ inset = 36, size = 46 }) => {
  const s = { position: "absolute" as const, width: size, height: size, borderColor: HUD, borderStyle: "solid" as const };
  return (
    <>
      <div style={{ ...s, left: inset, top: inset, borderWidth: "3px 0 0 3px" }} />
      <div style={{ ...s, right: inset, top: inset, borderWidth: "3px 3px 0 0" }} />
      <div style={{ ...s, left: inset, bottom: inset, borderWidth: "0 0 3px 3px" }} />
      <div style={{ ...s, right: inset, bottom: inset, borderWidth: "0 3px 3px 0" }} />
    </>
  );
};

type Scene = { spec: ShootoutSpec; T: ReturnType<typeof shootoutTimelineFor>; opts: ReturnType<typeof shootoutDefaults> };

// --- Intro: slams, model flashes, countdown ---------------------------------
const Intro: React.FC<{ s: Scene }> = ({ s: { spec, T, opts } }) => {
  const t = useTime();
  if (t > T.roundsStart + 0.05) return null;
  const b = T.b;
  const hookAt = (i: number) => b(0.5 + i * 1.75);
  const namesStart = b(6);
  const nameAt = (i: number) => namesStart + i * b(1.5);
  const current = lastIndex(opts.hook, (_, i) => t >= hookAt(i));
  const flashing = lastIndex(spec.models, (_, i) => t >= nameAt(i));
  const countdown = lastIndex([13, 14, 15], (beat) => t >= b(beat));
  const sh = shake(t, [...opts.hook.map((_, i) => hookAt(i)), ...spec.models.map((_, i) => nameAt(i))].filter((x) => x <= t).at(-1) ?? -9, 10);
  return (
    <AbsoluteFill style={{ background: DARK, transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      {t < namesStart && current >= 0 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 10 }}>
          {opts.hook.slice(0, current + 1).map((line, i) => (
            <Slam key={line} text={line} at={hookAt(i)} size={i === current ? 190 : 120} color={i === current ? "#fff" : "rgba(255,255,255,0.35)"} />
          ))}
        </AbsoluteFill>
      ) : null}
      {t >= namesStart && t < b(12.5) && flashing >= 0 ? (
        <AbsoluteFill>
          <div style={{ position: "absolute", inset: 0, opacity: 0.55, filter: "saturate(1.2)" }}>
            <Clip key={flashing} src={spec.shots[0]!.clips[flashing]!.video} from={nameAt(flashing)} startAt={spec.shots[0]!.clips[flashing]!.fromSeconds} zoom={1.08} />
          </div>
          <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.75), rgba(0,0,0,0.1))" }} />
          <div style={{ position: "absolute", left: 120, top: 380 }}>
            <div style={{ fontFamily: font.mono, fontSize: 30, color: color.brand, letterSpacing: "0.2em" }}>{String(flashing + 1).padStart(2, "0")} / {String(spec.models.length).padStart(2, "0")} · {spec.models[flashing]!.maker.toUpperCase()}</div>
            <Slam key={flashing} text={spec.models[flashing]!.name} at={nameAt(flashing)} size={200} />
          </div>
          <Flash at={nameAt(flashing)} len={0.07} />
        </AbsoluteFill>
      ) : null}
      {countdown >= 0 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <Slam key={countdown} text={String(3 - countdown)} at={b(13 + countdown)} size={460} color={countdown === 2 ? color.brand : "#fff"} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// --- Rounds: solos with whip cuts, then a 2×2 grid ---------------------------
const WHIP = 0.13;
const Solo: React.FC<{ s: Scene; r: number; i: number }> = ({ s: { spec, T, opts }, r, i }) => {
  const t = useTime();
  const start = T.solo(r, i), end = start + T.soloLen;
  if (t < start - WHIP || t > end + WHIP) return null;
  const clip = spec.shots[r]!.clips[i]!;
  const model = spec.models[i]!;
  const dir = (r * 4 + i) % 2 === 0 ? 1 : -1;
  const inP = prog(t, start - WHIP, WHIP * 2, easeInOut);
  const outP = prog(t, end - WHIP, WHIP * 2, easeInOut);
  const x = dir * ((1 - inP) * W * 0.55 - outP * W * 0.55);
  const whipBlur = 22 * (Math.sin(Math.PI * inP) + Math.sin(Math.PI * outP));
  const punch = 1.1 - 0.1 * prog(t, start, 0.4, easeOut);
  const sh = shake(t, start, 12);
  const name = prog(t, start + 0.05, 0.22, easeOut);
  const gen = interpolate(t, [start + 0.1, start + 0.7], [0, clip.genSeconds ?? 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const cost = interpolate(t, [start + 0.15, start + 0.75], [0, clip.costUsd ?? 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const blink = Math.floor(t * 3) % 2 === 0;
  return (
    <AbsoluteFill style={{ transform: `translate(${x + sh.x}px, ${sh.y}px) skewX(${-dir * 6 * (Math.sin(Math.PI * inP) + Math.sin(Math.PI * outP))}deg)`, filter: `blur(${whipBlur}px)`, overflow: "hidden", background: DARK }}>
      <Clip src={clip.video} from={start - WHIP} startAt={Math.max(0, clip.fromSeconds - WHIP)} zoom={punch} volume={opts.clipAudio} />
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 38%), linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 22%)" }} />
      <Brackets />
      <div style={{ position: "absolute", left: 76, top: 62, fontFamily: font.mono, fontSize: 24, color: HUD, letterSpacing: "0.16em" }}>
        R{String(r + 1).padStart(2, "0")} · {spec.shots[r]!.title} <span style={{ color: color.brand }}>· {String(i + 1).padStart(2, "0")}/{String(spec.models.length).padStart(2, "0")}</span>
      </div>
      <div style={{ position: "absolute", right: 76, top: 62, display: "flex", alignItems: "center", gap: 10, fontFamily: font.mono, fontSize: 24, color: HUD, letterSpacing: "0.16em" }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: blink ? "#ff3b30" : "transparent" }} />REC {formatSeconds(t - start)}
      </div>
      <div style={{ position: "absolute", left: 76, bottom: 70, opacity: name, transform: `translateX(${(1 - name) * -60}px)`, filter: `blur(${(1 - name) * 10}px)` }}>
        <div style={{ fontFamily: font.mono, fontSize: 26, color: color.brand, letterSpacing: "0.22em" }}>{model.maker.toUpperCase()}</div>
        <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: 150, lineHeight: 0.92, letterSpacing: "-0.04em", textTransform: "uppercase", color: "#fff" }}>{model.name}</div>
      </div>
      <div style={{ position: "absolute", right: 76, bottom: 76, display: "flex", gap: 38, opacity: name }}>
        {[...(clip.genSeconds !== undefined ? [["GEN", formatSeconds(gen)]] : []), ...(clip.costUsd !== undefined ? [["COST", `$${cost.toFixed(2)}`]] : [])].map(([k, v]) => (
          <div key={k} style={{ textAlign: "right" }}>
            <div style={{ fontFamily: font.mono, fontSize: 22, color: "rgba(255,255,255,0.6)", letterSpacing: "0.2em" }}>{k}</div>
            <div style={{ fontFamily: font.mono, fontWeight: 700, fontSize: 64, color: "#fff" }}>{v}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const RoundTitle: React.FC<{ s: Scene; r: number }> = ({ s: { spec, T }, r }) => {
  const t = useTime();
  const at = T.round(r);
  if (t < at || t > at + T.b(2)) return null;
  const out = prog(t, at + T.b(1.3), T.b(0.6), Easing.in(Easing.cubic));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - out, filter: `blur(${out * 20}px)`, transform: `scale(${1 + out * 0.2})` }}>
      <div style={{ fontFamily: font.mono, fontSize: 34, color: color.brand, letterSpacing: "0.4em", marginBottom: 6 }}>ROUND {String(r + 1).padStart(2, "0")}</div>
      <Slam text={spec.shots[r]!.title} at={at} size={300} style={{ WebkitTextStroke: "4px #fff", color: "transparent" }} />
    </AbsoluteFill>
  );
};

/** Vote grids replay each clip from its start in slight slow motion to cover the whole vote. */
export const VOTE_RATE = 0.85;

const Grid: React.FC<{ s: Scene; r: number; at: number; len: number; ring?: boolean; hopFrom?: number; replay?: boolean }> = ({ s: { spec, T }, r, at, len, ring, hopFrom = at, replay }) => {
  const t = useTime();
  if (t < at - 0.02 || t > at + len + 0.1) return null;
  const gap = 8, cw = (W - gap) / 2, ch = (H - gap) / 2;
  const hop = Math.floor((t - hopFrom) / T.beat);
  return (
    <AbsoluteFill style={{ background: DARK }}>
      {spec.models.map((m, i) => {
        const p = prog(t, at + i * 0.035, 0.22, easeOut);
        const clip = spec.shots[r]!.clips[i]!;
        const x = (i % 2) * (cw + gap), y = Math.floor(i / 2) * (ch + gap);
        const lit = ring && hop % spec.models.length === i;
        return (
          <div key={m.name} style={{ position: "absolute", left: x, top: y, width: cw, height: ch, overflow: "hidden", opacity: p, transform: `scale(${1.12 - 0.12 * p})`, outline: lit ? `6px solid ${color.brand}` : "none", outlineOffset: -6 }}>
            <Clip src={clip.video} from={at} startAt={replay ? 0 : clip.fromSeconds} rate={replay ? VOTE_RATE : 1} />
            <div style={{ position: "absolute", left: 24, ...(i < 2 ? { top: 20 } : { bottom: 20 }), display: "flex", alignItems: "center", gap: 12, fontFamily: font.mono, fontSize: 26, color: "#fff", letterSpacing: "0.12em", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
              <span style={{ width: 40, height: 40, borderRadius: 8, background: lit ? color.brand : "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", fontWeight: 700 }}>{i + 1}</span>
              {m.name.toUpperCase()}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// --- Race: accumulated time and cost across the shots ------------------------
const Race: React.FC<{ s: Scene }> = ({ s }) => {
  const { spec, T } = s;
  const t = useTime();
  if (t < T.race - 0.05 || t > T.vote + 0.05) return null;
  const rows = shootoutTotals(spec).sort((a, b) => a.genSeconds - b.genSeconds);
  // The slowest bar fills the track and finishes exactly when the ticker stops.
  const max = Math.max(...rows.map((r) => r.genSeconds));
  const { c0, c1 } = raceWindow(T);
  const clock = interpolate(t, [c0, c1], [0, max], { ...clamp, easing: Easing.bezier(0.3, 0, 0.7, 1) });
  const fastest = rows[0]!, slowest = rows.at(-1)!;
  const priciest = rows.reduce((a, b) => (b.costUsd > a.costUsd ? b : a));
  const enter = prog(t, T.race, 0.3, easeOut);
  const push = 1 + 0.05 * prog(t, T.race, T.vote - T.race, Easing.linear);
  return (
    <AbsoluteFill style={{ background: DARK, opacity: enter, transform: `scale(${push})` }}>
      <Brackets inset={48} />
      <div style={{ position: "absolute", left: 140, top: 120 }}>
        <div style={{ fontFamily: font.mono, fontSize: 30, color: color.brand, letterSpacing: "0.3em" }}>TIME & COST · {spec.shots.length === 1 ? "SAME PROMPT" : `${spec.shots.length} SHOTS EACH`}</div>
        <Slam text="WHO'S FASTEST?" at={T.race + 0.05} size={130} />
      </div>
      {rows.map((m, i) => {
        const row = prog(t, T.race + T.b(0.5) + i * 0.08, 0.35, easeOut);
        const elapsed = Math.min(clock, m.genSeconds);
        const done = clock >= m.genSeconds;
        const doneAt = c0 + ((c1 - c0) * m.genSeconds) / max;
        const lead = m === fastest;
        const badge = prog(t, doneAt, 0.3, easeOut);
        return (
          <div key={m.name} style={{ position: "absolute", left: 140, top: 430 + i * 140, width: W - 280, height: 100, display: "flex", alignItems: "center", gap: 36, opacity: row, transform: `translateX(${(1 - row) * -80}px)` }}>
            <div style={{ width: 400, fontFamily: font.display, fontWeight: 800, fontSize: 52, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.02em" }}>{m.name}</div>
            <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.1)", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0.8, (elapsed / max) * 100)}%`, background: lead ? color.brand : "#fff", boxShadow: lead ? `0 0 24px ${color.brand}` : "none" }} />
            </div>
            <div style={{ width: 260, textAlign: "right", fontFamily: font.mono, fontWeight: 700, fontSize: 56, color: done ? (lead ? color.brand : "#fff") : "rgba(255,255,255,0.45)" }}>{formatSeconds(elapsed)}</div>
            <div style={{ width: 170, textAlign: "right", fontFamily: font.mono, fontSize: 40, color: "rgba(255,255,255,0.6)", opacity: done ? 1 : 0.25 }}>${m.costUsd.toFixed(2)}</div>
            {lead ? (
              <div style={{ position: "absolute", left: 436, top: -58, height: 64, padding: "0 26px", background: color.brand, color: DARK, display: "flex", alignItems: "center", fontFamily: font.mono, fontWeight: 700, fontSize: 32, letterSpacing: "0.06em", opacity: badge, transform: `scale(${0.6 + 0.4 * badge})`, transformOrigin: "left center" }}>
                ⚡ {Math.round(slowest.genSeconds / m.genSeconds)}× FASTER{priciest !== m ? ` · ${Math.round(priciest.costUsd / Math.max(0.01, m.costUsd))}× CHEAPER` : ""}
              </div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// --- Vote --------------------------------------------------------------------
const Vote: React.FC<{ s: Scene }> = ({ s }) => {
  const { T, opts } = s;
  const t = useTime();
  if (t < T.vote - 0.05 || t > T.endcard + 0.7) return null;
  // One continuous grid for a single shot; otherwise rotate shots every 4 beats.
  // Tolerance: 12 beats / 4 beats is 3.0000000004 in floating point.
  const cycles = s.spec.shots.length > 1 ? Math.ceil((T.endcard - T.vote) / T.b(4) - 1e-6) : 1;
  return (
    <AbsoluteFill>
      {/* Rotating shots keeps the drop's energy; a cut, not a flash, between them. */}
      {Array.from({ length: cycles }, (_, k) => {
        const at = T.vote + k * T.b(4);
        // The last grid stays under the end card's circular wipe (0.55 s).
        const len = k === cycles - 1 ? T.endcard + 0.7 - at : T.b(4);
        const shot = (opts.vote.shot + k) % s.spec.shots.length;
        return (
          <Grid key={k} s={s} r={shot} at={at} len={len} ring hopFrom={T.vote} replay />
        );
      })}
      {/* A full-width band behind the question keeps it clean over the grid labels. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: H / 2 - 150, height: 300, background: "rgba(8,8,7,0.78)", backdropFilter: "blur(6px)", transform: `scaleY(${prog(t, T.vote, 0.25, easeOut)})` }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <Slam text={opts.vote.title} at={T.vote + 0.02} size={Math.min(170, Math.floor(2700 / opts.vote.title.length))} style={{ textShadow: "0 8px 40px rgba(0,0,0,0.8)" }} />
        <div style={{ marginTop: 18, fontFamily: font.mono, fontSize: 34, color: "#fff", letterSpacing: "0.3em", opacity: prog(t, T.vote + T.b(2), 0.3) }}>{opts.vote.cta.toUpperCase()}</div>
      </AbsoluteFill>
      <Flash at={T.vote} />
    </AbsoluteFill>
  );
};

/** The race clock runs from 2 beats after the race starts to 3 beats before the vote. */
const raceWindow = (T: Scene["T"]) => ({ c0: T.race + T.b(2), c1: T.vote - T.b(3) });

/** SFX cues on the beat grid. */
const cues = ({ spec, T, opts }: Scene) => {
  const b = T.b;
  const out: { at: number; id: string; volume: number }[] = [
    ...opts.hook.map((_, i) => ({ at: b(0.5 + i * 1.75) - 0.02, id: "boom-hit", volume: 0.35 })),
    ...spec.models.map((_, i) => ({ at: b(6) + i * b(1.5) - 0.02, id: "shutter", volume: 0.5 })),
    { at: b(12) - 0.2, id: "engine-riser", volume: 0.55 },
    ...[13, 14, 15].map((beat) => ({ at: b(beat) - 0.02, id: "ui-check", volume: 0.6 })),
    { at: T.roundsStart - 0.03, id: "gravel-burst", volume: 0.7 },
    { at: T.roundsStart, id: "boom-hit", volume: 0.5 },
  ];
  spec.shots.forEach((_, r) => {
    if (r > 0) out.push({ at: T.round(r) - 0.02, id: "boom-hit", volume: 0.45 });
    for (let i = 1; i < spec.models.length; i++) out.push({ at: T.solo(r, i) - WHIP, id: "whip", volume: 0.6 });
    out.push({ at: T.grid(r) - WHIP, id: "whip", volume: 0.5 }, { at: T.grid(r), id: "shutter", volume: 0.55 });
  });
  out.push(
    { at: T.race - 0.05, id: "whip", volume: 0.5 },
    { at: T.vote - 2, id: "engine-riser", volume: 0.5 },
    { at: T.vote - 0.02, id: "boom-hit", volume: 0.55 },
    ...Array.from({ length: 8 }, (_, i) => ({ at: T.vote + i * T.beat, id: "ui-check", volume: 0.3 })),
    { at: T.endcard - 0.3, id: "logo-sting-dark", volume: 0.75 },
  );
  if (T.vote === T.race) return out;
  const rows = shootoutTotals(spec);
  const fastest = Math.min(...rows.map((r) => r.genSeconds));
  // The slowest bar fills the track and finishes exactly when the ticker stops.
  const max = Math.max(...rows.map((r) => r.genSeconds));
  const { c0, c1 } = raceWindow(T);
  out.push({ at: c0 + ((c1 - c0) * fastest) / max, id: "win-stinger", volume: 0.5 });
  return out;
};

/** Repeat a short SFX back-to-back over [from, to]; the last copy is cut exactly at `to`. */
const LoopedSfx: React.FC<{ id: string; from: number; to: number; clipSeconds: number; volume: number }> = ({ id, from, to, clipSeconds, volume }) => {
  const { fps } = useVideoConfig();
  const copies = Math.ceil((to - from) / clipSeconds);
  return (
    <>
      {Array.from({ length: copies }, (_, k) => {
        const start = from + k * clipSeconds;
        const len = Math.min(clipSeconds, to - start);
        return (
          <Sequence key={k} from={Math.round(start * fps)} durationInFrames={Math.max(1, Math.round(len * fps))} layout="none">
            <Audio src={staticFile(`sfx/${id}.mp3`)} volume={volume} />
          </Sequence>
        );
      })}
    </>
  );
};

export const Shootout: React.FC<ShootoutSpec> = (spec) => {
  const { fps } = useVideoConfig();
  const s: Scene = { spec, T: shootoutTimelineFor(spec), opts: shootoutDefaults(spec) };
  const { T } = s;
  const f = (sec: number) => Math.round(sec * fps);
  const music = spec.music;
  const musicStart = music ? music.firstBeatSeconds + music.offsetBeats * music.beatSeconds : 0;
  const level = music?.volume ?? 0.7;
  return (
    <AbsoluteFill style={{ background: DARK }}>
      <Intro s={s} />
      {spec.shots.map((_, r) => (
        <React.Fragment key={r}>
          {spec.models.map((__, i) => <Solo key={i} s={s} r={r} i={i} />)}
          <Grid s={s} r={r} at={T.grid(r)} len={T.gridLen} />
          <RoundTitle s={s} r={r} />
          <Flash at={T.round(r)} />
          <Flash at={T.grid(r)} len={0.06} />
        </React.Fragment>
      ))}
      {T.vote > T.race && <Race s={s} />}
      <Vote s={s} />
      <BrandEndCard at={T.endcard} tagline={s.opts.endcard.tagline} background={DARK} />
      {music && (
        <Audio
          src={staticFile(music.src)}
          startFrom={f(musicStart)}
          volume={(frame) => interpolate(frame, [0, f(0.1), f(T.end - 1), f(T.end)], [0, level, level, 0], clamp)}
        />
      )}
      {T.vote > T.race && <LoopedSfx id="race-ticker" from={raceWindow(T).c0} to={raceWindow(T).c1} clipSeconds={2} volume={0.35} />}
      {cues(s).map((cue, i) => (
        <Sequence key={i} from={f(Math.max(0, cue.at))} durationInFrames={f(3)} layout="none">
          <Audio src={staticFile(`sfx/${cue.id}.mp3`)} volume={cue.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
