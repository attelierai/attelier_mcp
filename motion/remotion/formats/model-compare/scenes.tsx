import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import type { CompareModel } from "../../../src/formats/model-compare";
import { color, font } from "../../brand";
import { BlurText, Clip, Frame, type Rect, clamp, easeIn, easeInOut, easeOut, formatSeconds, lerpRect, prog, useSpring, useTime } from "../../kit/primitives";
import { BrandEndCard } from "../../kit/end-card";
import { useScene } from "./context";

const W = 1920, H = 1080;
const FULL: Rect = { x: 44, y: 44, w: W - 88, h: H - 88, r: 40 };
const gridRect = (i: number, cw = 560, ch = 315, gap = 22, cy = 470): Rect => {
  const col = i % 2, row = Math.floor(i / 2);
  const x0 = (W - (cw * 2 + gap)) / 2, y0 = cy - (ch * 2 + gap) / 2;
  return { x: x0 + col * (cw + gap), y: y0 + row * (ch + gap), w: cw, h: ch, r: 28 };
};
const gridFrom = (m: CompareModel) => m.gridFromSeconds ?? 1.5;

export const Background: React.FC = () => {
  const t = useTime();
  const g = (phase: number) => Math.sin(t * 0.35 + phase);
  return (
    <AbsoluteFill style={{ background: color.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1400, height: 1400, left: 900 + g(0) * 120, top: -700 + g(1) * 80, borderRadius: "50%", background: `radial-gradient(circle, ${color.brandSoft}66 0%, transparent 62%)` }} />
      <div style={{ position: "absolute", width: 1200, height: 1200, left: -500 + g(2) * 100, top: 300 + g(3) * 90, borderRadius: "50%", background: `radial-gradient(circle, ${color.brand}33 0%, transparent 60%)` }} />
    </AbsoluteFill>
  );
};

/** Two-line kinetic hook; the first character of line 2 is accented. */
export const Headline: React.FC = () => {
  const { T, opts } = useScene();
  const t = useTime();
  if (t > T.createIn + 0.6) return null;
  const lift = prog(t, T.headline2 - 0.1, 0.45, easeOut);
  const out = prog(t, T.createIn - 0.1, 0.45, easeIn);
  const [line1, line2] = opts.headline;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - out, filter: `blur(${out * 20}px)`, transform: `scale(${1 + out * 0.12})` }}>
      <div style={{ textAlign: "center", fontFamily: font.display, fontWeight: 700, letterSpacing: "-0.045em", lineHeight: 0.95 }}>
        <div style={{ fontSize: 190, color: color.ink, transform: `translateY(${-lift * 20}px) scale(${1 - lift * 0.18})`, opacity: 1 - lift * 0.45 }}>
          <BlurText text={line1} at={T.headline1} />
        </div>
        <div style={{ fontSize: 230, marginTop: 8, height: 230 }}>
          <BlurText text={line2} at={T.headline2} stagger={0.035} style={{ color: color.ink }} letterColor={(i) => (i === 0 ? color.brand : undefined)} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const NamePill: React.FC<{ model: CompareModel; index: number; opacity?: number }> = ({ model, index, opacity = 1 }) => (
  <div style={{ position: "absolute", left: 18, bottom: 18, display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 18px 0 8px", borderRadius: 24, background: "rgba(255,255,255,0.88)", backdropFilter: "blur(10px)", fontFamily: font.ui, fontWeight: 600, fontSize: 22, color: color.ink, opacity }}>
    <span style={{ width: 32, height: 32, borderRadius: 16, background: color.ink, color: "#fff", display: "grid", placeItems: "center", fontFamily: font.mono, fontSize: 16 }}>{index + 1}</span>
    {model.name}
  </div>
);

/** Results in the Create library → first expands → carousel of showcases. */
export const Cards: React.FC = () => {
  const { spec, T } = useScene();
  const t = useTime();
  if (t < T.tilesIn - 0.1 || t > T.race + T.swap) return null;
  return <AbsoluteFill>{spec.models.map((m, i) => <CardLife key={m.name} model={m} index={i} />)}</AbsoluteFill>;
};

const CardLife: React.FC<{ model: CompareModel; index: number }> = ({ model, index }) => {
  const { spec, T } = useScene();
  const t = useTime();
  const enter = useSpring(T.tilesIn + index * 0.09, { damping: 16, stiffness: 170 });
  const fastest = Math.min(...spec.models.map((m) => m.genSeconds));
  const doneAt = model.genSeconds === fastest ? T.fastDone : T.restDone + index * 0.07;
  const ready = prog(t, doneAt, 0.3, easeOut);
  const s0 = T.showcase + index * T.showcaseLen;
  const s1 = s0 + T.showcaseLen;
  const expand = index === 0 ? prog(t, T.showcase - 0.05, 0.62, easeInOut) : 0;
  const othersOut = index === 0 ? 0 : prog(t, T.showcase - 0.05, 0.4, easeIn);
  const inGrid = t < T.showcase + 0.62;
  const swapIn = index === 0 ? 1 : prog(t, s0 - T.swap / 2, T.swap, easeInOut);
  const swapOut = prog(t, s1 - T.swap / 2, T.swap, easeInOut);
  const inShow = t >= s0 - T.swap / 2 && t <= s1 + T.swap / 2;

  const layers: React.ReactNode[] = [];
  if (inGrid && (index === 0 || othersOut < 1)) {
    const g = gridRect(index);
    const rect = index === 0 ? lerpRect(g, FULL, expand) : g;
    layers.push(
      <Frame key="grid" rect={{ ...rect, y: rect.y + (1 - enter) * 40 }} style={{ opacity: Math.min(1, enter * 1.3) * (1 - othersOut), transform: `scale(${(0.9 + 0.1 * enter) * (1 - othersOut * 0.12)})`, background: color.card2, boxShadow: "0 16px 40px rgba(35,38,28,0.12)", zIndex: index === 0 ? 5 : 1, filter: `blur(${othersOut * 10}px)` }}>
        {ready < 1 ? <Skeleton model={model} doneAt={doneAt} /> : null}
        <div style={{ position: "absolute", inset: 0, opacity: ready * (1 - expand), filter: `blur(${(1 - ready) * 16}px)`, transform: `scale(${1.08 - 0.08 * ready})` }}>
          {t >= doneAt ? <Clip src={model.video} from={doneAt} startAt={gridFrom(model)} /> : null}
        </div>
        {index === 0 && expand > 0 ? (
          <div style={{ position: "absolute", inset: 0, opacity: expand }}>
            <Clip src={model.video} from={T.showcase - 0.05} startAt={0.3} />
          </div>
        ) : null}
        <NamePill model={model} index={index} opacity={ready * (1 - expand)} />
      </Frame>,
    );
  }
  if (inShow && !(index === 0 && t < T.showcase + 0.62)) {
    const x = (1 - swapIn) * (W + 60) - swapOut * (W + 60);
    const squeeze = 1 - 0.1 * Math.sin(Math.PI * (index === 0 ? swapOut : swapIn < 1 ? swapIn : swapOut));
    const blur = 7 * Math.sin(Math.PI * (swapIn < 1 ? swapIn : swapOut));
    const local = t - (index === 0 ? T.showcase : s0 - T.swap / 2);
    layers.push(
      <Frame key="show" rect={FULL} style={{ transform: `translateX(${x}px) scale(${squeeze})`, filter: `blur(${blur}px)` }}>
        <Clip src={model.video} from={index === 0 ? T.showcase - 0.05 : s0 - T.swap / 2} startAt={index === 0 ? 0.3 : 0} zoom={1 + 0.05 * Math.min(1, local / T.showcaseLen)} />
        <ShowcaseOverlay model={model} index={index} at={index === 0 ? T.showcase + 0.35 : s0 + 0.1} />
      </Frame>,
    );
  }
  return <>{layers}</>;
};

const ShowcaseOverlay: React.FC<{ model: CompareModel; index: number; at: number }> = ({ model, index, at }) => {
  const { spec } = useScene();
  const t = useTime();
  const count = interpolate(t, [at + 0.35, at + 1.15], [0, model.genSeconds], { ...clamp, easing: Easing.out(Easing.cubic) });
  const cost = interpolate(t, [at + 0.45, at + 1.25], [0, model.costUsd], { ...clamp, easing: Easing.out(Easing.cubic) });
  const pill = useSpring(at + 0.3, { damping: 14 });
  const fast = model.genSeconds === Math.min(...spec.models.map((m) => m.genSeconds));
  const total = String(spec.models.length).padStart(2, "0");
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,8,6,0.72) 0%, rgba(8,8,6,0.2) 32%, transparent 55%)" }} />
      <div style={{ position: "absolute", left: 40, top: 36, height: 50, padding: "0 20px", borderRadius: 25, display: "flex", alignItems: "center", gap: 12, background: "rgba(20,20,16,0.45)", backdropFilter: "blur(14px)", color: "#fff", fontFamily: font.mono, fontSize: 22, opacity: prog(t, at, 0.3) }}>
        {String(index + 1).padStart(2, "0")} <span style={{ opacity: 0.5 }}>/ {total}</span>
      </div>
      <div style={{ position: "absolute", left: 64, bottom: 54, color: "#fff" }}>
        <div style={{ fontFamily: font.ui, fontSize: 30, fontWeight: 500, opacity: 0.78, marginBottom: 4 }}><BlurText text={model.maker} at={at} /></div>
        <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 170, letterSpacing: "-0.045em", lineHeight: 0.9 }}><BlurText text={model.name} at={at + 0.08} stagger={0.03} /></div>
      </div>
      <div style={{ position: "absolute", right: 56, bottom: 64, display: "flex", alignItems: "center", gap: 16, height: 84, padding: "0 30px", borderRadius: 42, background: fast ? color.brand : "rgba(255,255,255,0.14)", backdropFilter: "blur(16px)", border: fast ? "none" : "1.5px solid rgba(255,255,255,0.25)", color: "#fff", transform: `scale(${0.7 + 0.3 * pill})`, opacity: Math.min(1, pill * 1.5), transformOrigin: "right center" }}>
        <span style={{ fontFamily: font.ui, fontSize: 24, fontWeight: 500, opacity: 0.8 }}>Generated in</span>
        <span style={{ fontFamily: font.mono, fontSize: 44, fontWeight: 700, minWidth: 110, textAlign: "right" }}>{formatSeconds(count)}</span>
        <span style={{ width: 1.5, height: 34, background: "rgba(255,255,255,0.35)" }} />
        <span style={{ fontFamily: font.mono, fontSize: 44, fontWeight: 700, minWidth: 120, textAlign: "right" }}>${cost.toFixed(2)}</span>
      </div>
    </>
  );
};

/** Time-lapsed generation race with cost column. */
export const Race: React.FC = () => {
  const { spec, T, opts } = useScene();
  const t = useTime();
  if (t < T.race - T.swap || t > T.outro + 0.6) return null;
  const race = [...spec.models].sort((a, b) => a.genSeconds - b.genSeconds);
  const max = Math.ceil(Math.max(...race.map((m) => m.genSeconds)) / 30) * 30;
  const enter = prog(t, T.race - T.swap / 2, T.swap, easeInOut);
  const out = prog(t, T.outro - 0.1, 0.5, easeIn);
  const clock = interpolate(t, [T.race + 0.9, T.race + 3.3], [0, max], { ...clamp, easing: Easing.bezier(0.3, 0, 0.7, 1) });
  const fastest = race[0]!, slowest = race.at(-1)!;
  const priciest = spec.models.reduce((a, b) => (b.costUsd > a.costUsd ? b : a));
  return (
    <AbsoluteFill style={{ transform: `translateX(${(1 - enter) * (W + 60)}px)`, opacity: 1 - out, filter: `blur(${out * 16}px)` }}>
      <div style={{ position: "absolute", left: 150, top: 110 }}>
        <div style={{ fontFamily: font.ui, fontSize: 30, fontWeight: 600, color: color.brand, letterSpacing: "0.12em", textTransform: "uppercase" }}><BlurText text={opts.race.kicker} at={T.race + 0.1} /></div>
        <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 104, letterSpacing: "-0.045em", color: color.ink, marginTop: 6 }}><BlurText text={opts.race.title} at={T.race + 0.2} stagger={0.018} /></div>
      </div>
      {race.map((m, i) => {
        const row = prog(t, T.race + 0.35 + i * 0.09, 0.5, easeOut);
        const elapsed = Math.min(clock, m.genSeconds);
        const done = clock >= m.genSeconds;
        const badge = prog(t, T.race + 0.9 + (2.4 * m.genSeconds) / max, 0.35, easeOut);
        const lead = m === fastest;
        return (
          <div key={m.name} style={{ position: "absolute", left: 150, top: 400 + i * 142, width: W - 300, height: 110, display: "flex", alignItems: "center", gap: 36, opacity: row, transform: `translateY(${(1 - row) * 40}px)`, filter: `blur(${(1 - row) * 8}px)` }}>
            <div style={{ width: 360, fontFamily: font.ui, fontWeight: 650, fontSize: 44, color: color.ink, letterSpacing: "-0.02em" }}>{m.name}</div>
            <div style={{ flex: 1, height: 26, borderRadius: 13, background: "rgba(27,27,24,0.07)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(1.2, (elapsed / max) * 100)}%`, borderRadius: 13, background: lead ? `linear-gradient(90deg, ${color.brand}, ${color.brandSoft})` : color.ink, opacity: done ? 1 : 0.85 }} />
            </div>
            <div style={{ width: 170, textAlign: "right", fontFamily: font.mono, fontWeight: 700, fontSize: 50, color: done ? (lead ? color.brand : color.ink) : color.dim }}>{formatSeconds(elapsed)}</div>
            <div style={{ width: 150, textAlign: "right", fontFamily: font.mono, fontWeight: 600, fontSize: 38, color: color.dim, opacity: done ? 1 : 0.25 }}>${m.costUsd.toFixed(2)}</div>
            {lead ? (
              <div style={{ position: "absolute", left: 456, top: -34, height: 56, padding: "0 22px", borderRadius: 28, background: color.brand, color: "#fff", display: "flex", alignItems: "center", fontFamily: font.ui, fontWeight: 700, fontSize: 26, opacity: badge, transform: `scale(${0.6 + 0.4 * badge}) translateY(${(1 - badge) * 10}px)` }}>
                ⚡ {Math.round(slowest.genSeconds / m.genSeconds)}× faster{priciest !== m ? ` · ${Math.round(priciest.costUsd / Math.max(0.01, m.costUsd))}× cheaper` : ""}
              </div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** The vote: grid again, a selection ring hopping on the beat. */
export const Outro: React.FC = () => {
  const { spec, T, opts } = useScene();
  const t = useTime();
  if (t < T.outro - 0.1 || t > T.endcard + 1) return null;
  const hop = Math.floor((t - (T.outro + 0.9)) / T.beat);
  const ringOn = t > T.outro + 0.9 && hop < 6;
  const r = gridRect(((hop % 4) + 4) % 4, 640, 360, 28, 610);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 70, width: W, textAlign: "center", fontFamily: font.display, fontWeight: 700, fontSize: 118, letterSpacing: "-0.045em", color: color.ink }}>
        <BlurText text={opts.outro.title} at={T.outro + 0.05} stagger={0.025} />
      </div>
      {spec.models.map((m, i) => <OutroCard key={m.name} model={m} index={i} />)}
      {ringOn ? <div style={{ position: "absolute", left: r.x - 10, top: r.y - 10, width: r.w + 20, height: r.h + 20, borderRadius: 36, border: `6px solid ${color.brand}`, boxShadow: `0 0 40px ${color.brand}66` }} /> : null}
      <div style={{ position: "absolute", bottom: 34, width: W, textAlign: "center", fontFamily: font.ui, fontSize: 30, fontWeight: 600, color: color.dim, opacity: prog(t, T.outro + 1.2, 0.5) }}>{opts.outro.cta}</div>
    </AbsoluteFill>
  );
};

const OutroCard: React.FC<{ model: CompareModel; index: number }> = ({ model, index }) => {
  const { T } = useScene();
  const s = useSpring(T.outro + 0.25 + index * 0.08, { damping: 15 });
  const r = gridRect(index, 640, 360, 28, 610);
  return (
    <Frame rect={{ ...r, y: r.y + (1 - s) * 120 }} style={{ opacity: Math.min(1, s * 1.4), transform: `scale(${0.9 + 0.1 * s})` }}>
      <Clip src={model.video} from={T.outro} startAt={0.4} />
      <NamePill model={model} index={index} />
    </Frame>
  );
};

const Skeleton: React.FC<{ model: CompareModel; doneAt: number }> = ({ model, doneAt }) => {
  const { T } = useScene();
  const t = useTime();
  const sweep = ((t * 0.9) % 1) * 160 - 30;
  const elapsed = interpolate(t, [T.send, doneAt], [0, model.genSeconds], clamp);
  return (
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(100deg, ${color.card2} ${sweep}%, #fbfbf8 ${sweep + 12}%, ${color.card2} ${sweep + 24}%)`, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 22, fontFamily: font.ui }}>
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", color: color.faint }}>GENERATING</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 650, color: color.ink }}>{model.name}</span>
        <span style={{ fontFamily: font.mono, fontSize: 20, color: color.dim }}>{formatSeconds(elapsed)}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: color.line, marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: `${(elapsed / model.genSeconds) * 100}%`, height: "100%", background: color.brand }} />
      </div>
    </div>
  );
};

/** Brand end card from the kit, fed by the spec's tagline. */
export const EndCard: React.FC = () => {
  const { T, opts } = useScene();
  return <BrandEndCard at={T.endcard} tagline={opts.endcard.tagline} />;
};
