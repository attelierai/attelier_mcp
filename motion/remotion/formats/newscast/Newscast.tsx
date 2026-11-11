// Newscast: a cable-news bulletin. Title sequence with the news theme →
// presenters who already speak, full frame or split like a news channel: the
// presenter boxed on the left, the story's material on the right (PR, chart,
// figures, post, podcast, list, quote, image or clip), a headline band with the
// desk tab, LIVE, logo and clock, and a ticker; graphic wipes between segments
// → closing card with its sting. Each clip plays with its own sound inside its
// segment only, so speech stays exactly where the model put it.
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { type NewscastPanel, type NewscastSegment, type NewscastSpec, newscastTimeline } from "../../../src/formats/newscast";
import { color, font, loadBrandFonts } from "../../brand";
import { clamp, easeInOut, easeOut, prog, useTime } from "../../kit/primitives";

loadBrandFonts();

const W = 1920, H = 1080;
const NAVY = "#0b1530", NAVY2 = "#13234a", INK = "#10131a", LIVE_RED = "#d71920";
const BLUE_DEEP = "#061a4a", BLUE = "#0c3a9c", BLUE_LIGHT = "#1f63d6";
type Timeline = ReturnType<typeof newscastTimeline>;
type Seg = Timeline["segments"][number] & NewscastSegment;
type Rect = { x: number; y: number; w: number; h: number };
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
// Split layout, as a news channel frames it: presenter box, material box, band, ticker.
const ANCHOR: Rect = { x: 78, y: 118, w: 500, h: 700 };
const MATERIAL: Rect = { x: 590, y: 118, w: 1252, h: 700 };
const BAND_Y = 818, BAND_H = 150, TICKER_H = 84;

/** A bundled sound effect at a moment. */
const Sfx: React.FC<{ src: string; at: number; volume: number }> = ({ src, at, volume }) => {
  const { fps } = useVideoConfig();
  return <Sequence from={Math.max(0, Math.round(at * fps))} layout="none"><Audio src={staticFile(src)} volume={volume} /></Sequence>;
};

/** Studio graphics backdrop for titles and the closing card: deep navy, a light sweep, a perspective grid. */
const Backdrop: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const t = useTime() + seed;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 40%, ${NAVY2}, ${NAVY} 55%, #050a18)`, overflow: "hidden" }}>
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "80px 80px", backgroundPosition: `${(t * 18) % 80}px ${(t * 8) % 80}px`, transform: "perspective(900px) rotateX(58deg) translateY(260px) scale(1.8)", opacity: 0.55 }} />
      {[0, 1, 2, 3].map((i) => {
        const x = ((t * (90 + i * 35) + i * 520) % (W + 900)) - 450;
        return <div key={i} style={{ position: "absolute", top: -200, left: x, width: 140 + i * 40, height: H + 400, transform: "skewX(-22deg)", background: `linear-gradient(90deg, transparent, ${i % 2 ? "rgba(255,143,68,0.10)" : "rgba(120,170,255,0.08)"}, transparent)` }} />;
      })}
      <div style={{ position: "absolute", left: -300, top: -300, width: 900, height: 900, borderRadius: 450, background: "radial-gradient(circle, rgba(255,143,68,0.18), transparent 70%)", transform: `translate(${Math.sin(t * 0.4) * 80}px, ${Math.cos(t * 0.3) * 60}px)` }} />
    </AbsoluteFill>
  );
};

/** The channel's blue wall behind split segments: gradient, slow light bands and the show name in relief. */
const Wall: React.FC<{ name: string }> = ({ name }) => {
  const t = useTime();
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${BLUE_DEEP} 0%, ${BLUE} 55%, ${BLUE_LIGHT} 100%)`, overflow: "hidden" }}>
      {[0, 1, 2].map((i) => {
        const x = ((t * (40 + i * 18) + i * 700) % (W + 1200)) - 600;
        return <div key={i} style={{ position: "absolute", top: -300, left: x, width: 380 + i * 120, height: H + 600, transform: "skewX(-24deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)" }} />;
      })}
      <div style={{ position: "absolute", right: -40, top: -30, fontFamily: font.display, fontWeight: 800, fontSize: 150, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.045)", whiteSpace: "nowrap", transform: `translateX(${-t * 6}px)` }}>{`${name} · ${name}`}</div>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 120%, rgba(0,0,0,0.45), transparent 60%)" }} />
    </AbsoluteFill>
  );
};

/** Network lines drawing themselves across the title sequence. */
const NetworkLines: React.FC<{ at: number }> = ({ at }) => {
  const t = useTime();
  const pts = Array.from({ length: 22 }, (_, i) => ({ x: ((i * 911) % 1800) + 60, y: ((i * 577) % 900) + 90 }));
  const links = pts.flatMap((p, i) => [pts[(i + 3) % pts.length]!, pts[(i + 7) % pts.length]!].map((q) => [p, q] as const));
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
      {links.map(([p, q], i) => {
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        const d = prog(t, at + (i % 12) * 0.06, 1.2, easeOut);
        return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={i % 5 ? "rgba(140,180,255,0.35)" : "rgba(255,143,68,0.6)"} strokeWidth={1.4} strokeDasharray={len} strokeDashoffset={len * (1 - d)} />;
      })}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5 * prog(t, at + 0.3 + (i % 9) * 0.05, 0.4, easeOut)} fill={i % 4 ? "#9fc0ff" : color.brand} />)}
    </svg>
  );
};

/** Diagonal brand bars sweeping across; fully covering the frame at `at`. */
const Wipe: React.FC<{ at: number }> = ({ at }) => {
  const t = useTime();
  if (t < at - 0.45 || t > at + 0.45) return null;
  const p = interpolate(t, [at - 0.45, at + 0.45], [0, 1], { ...clamp, easing: easeInOut });
  const bars = [{ c: color.brand, w: 900, d: 0 }, { c: NAVY, w: 1400, d: 0.08 }, { c: "#ffffff", w: 60, d: 0.14 }];
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      {bars.map((b, i) => {
        const q = Math.min(1, Math.max(0, (p - b.d) / (1 - b.d)));
        const x = lerp(-b.w - 700, W + 700, q);
        return <div key={i} style={{ position: "absolute", top: -300, bottom: -300, left: x, width: b.w, background: b.c, transform: "skewX(-20deg)", boxShadow: "0 0 60px rgba(0,0,0,0.35)" }} />;
      })}
    </AbsoluteFill>
  );
};

const TitleSequence: React.FC<{ spec: NewscastSpec; T: Timeline }> = ({ spec, T }) => {
  const t = useTime();
  if (t > T.intro + 0.1) return null;
  const words = spec.show.name.split(" ");
  const last = words.pop() ?? "";
  const first = words.join(" ");
  const inA = prog(t, 0.9, 0.55, easeOut), inB = prog(t, 1.15, 0.5, easeOut);
  const glint = prog(t, 1.9, 0.9, easeInOut);
  const bar = prog(t, 1.7, 0.6, easeOut);
  const push = 1 + 0.04 * prog(t, 0, T.intro, (n) => n);
  const ring = t * 22;
  return (
    <AbsoluteFill style={{ opacity: prog(t, 0, 0.35, easeOut) }}>
      <Backdrop />
      <NetworkLines at={0.2} />
      <div style={{ position: "absolute", left: W / 2 - 520, top: H / 2 - 520, width: 1040, height: 1040, borderRadius: 520, background: `conic-gradient(from ${ring}deg, transparent, rgba(255,143,68,0.22), transparent 30%, rgba(120,170,255,0.18), transparent 60%)`, filter: "blur(6px)", opacity: prog(t, 0.3, 1, easeOut) }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", transform: `scale(${push})` }}>
        <div style={{ fontFamily: font.mono, fontSize: 26, letterSpacing: "0.55em", paddingLeft: "0.55em", color: "rgba(255,255,255,0.75)", opacity: prog(t, 0.5, 0.4, easeOut), marginBottom: 24 }}>{spec.intro?.overline ?? "DAILY EDITION"}</div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 26, overflow: "hidden", padding: "6px 10px" }}>
          <span style={{ fontFamily: font.display, fontWeight: 800, fontSize: 150, letterSpacing: "-0.02em", color: "#fff", transform: `translateX(${(1 - inA) * -240}px)`, opacity: inA }}>{first}</span>
          <span style={{ fontFamily: font.display, fontWeight: 800, fontSize: 150, letterSpacing: "-0.02em", color: INK, background: color.brand, padding: "0 26px 6px", borderRadius: 8, transform: `translateX(${(1 - inB) * 240}px) scale(${0.85 + 0.15 * inB})`, opacity: inB }}>{last}</span>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: lerp(-300, 1500, glint), width: 160, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)", transform: "skewX(-20deg)", mixBlendMode: "overlay" }} />
        </div>
        <div style={{ height: 6, width: 760 * bar, background: `linear-gradient(90deg, transparent, ${color.brand}, transparent)`, marginTop: 30 }} />
        <div style={{ marginTop: 24, fontFamily: font.mono, fontSize: 30, letterSpacing: "0.32em", color: "rgba(255,255,255,0.88)", opacity: prog(t, 2.0, 0.5, easeOut) }}>{spec.show.date}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The presenter: full frame, or cropped into the left box of the split layout. */
const Presenter: React.FC<{ s: Seg; name: string }> = ({ s, name }) => {
  const t = useTime();
  const { fps } = useVideoConfig();
  const split = s.layout === "split";
  const inP = split ? prog(t, s.start + 0.15, 0.55, easeOut) : 1;
  const video = <OffthreadVideo src={staticFile(s.video)} startFrom={Math.round((s.fromSeconds ?? 0) * fps)} volume={1} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />;
  return (
    <Sequence from={Math.round(s.start * fps)} durationInFrames={Math.round(s.seconds * fps)}>
      {split ? (
        <>
          <Wall name={name} />
          <div style={{ position: "absolute", left: ANCHOR.x, top: ANCHOR.y, width: ANCHOR.w, height: ANCHOR.h, overflow: "hidden", background: "#000", boxShadow: "0 30px 70px rgba(0,0,0,0.45)", transform: `translateX(${(1 - inP) * -140}px)`, opacity: inP }}>{video}</div>
        </>
      ) : video}
    </Sequence>
  );
};

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n)));
/** Animate the leading number of a value ("+171%", "$49.1M", "49,087") up from zero. */
const countUp = (value: string, p: number) => value.replace(/\d[\d,]*(?:\.\d+)?/, (n) => {
  const x = Number(n.replace(/,/g, ""));
  const digits = n.includes(".") ? n.split(".")[1]!.length : 0;
  const shown = x * p;
  return n.includes(",") ? shown.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : shown.toFixed(digits);
});
/** Long raw figures ("$49,087,343.73") read as channels print them ("$49.1M"). */
const shortFigure = (value: string) => value.replace(/\d[\d,]{4,}(?:\.\d+)?/, (n) => (Number(n.replace(/,/g, "")) >= 10_000 ? compact(Number(n.replace(/,/g, ""))) : n));
const hue = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Small uppercase header shared by the panels: source tag left, ILLUSTRATIVE right when simulated. */
const PanelHeader: React.FC<{ tag: string; dark?: boolean; illustrative?: boolean | undefined; accent?: string }> = ({ tag, dark = true, illustrative, accent = color.brand }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: font.mono, fontSize: 20, letterSpacing: "0.18em", color: dark ? "rgba(255,255,255,0.7)" : "rgba(16,19,26,0.6)" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 12, height: 12, background: accent }} />{tag}</span>
    {illustrative ? <span style={{ fontSize: 16, padding: "5px 10px", border: `1px solid ${dark ? "rgba(255,255,255,0.35)" : "rgba(16,19,26,0.3)"}`, borderRadius: 4 }}>ILLUSTRATIVE</span> : null}
  </div>
);

const PrPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "pr" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  const state = p.state ?? "merged";
  const pill = { merged: "#8957e5", open: "#238636", closed: "#da3633" }[state];
  const adds = p.additions ?? 0, dels = p.deletions ?? 0;
  const green = adds + dels ? Math.round((adds / (adds + dels)) * 5) : 0;
  const n = prog(t, at + 0.5, 1, easeOut);
  return (
    <div style={{ width: "100%", height: "100%", background: "#0d1117", padding: "44px 56px", boxSizing: "border-box", display: "flex", flexDirection: "column", color: "#e6edf3", fontFamily: font.ui }}>
      <PanelHeader tag="GITHUB" illustrative={p.illustrative} accent="#8957e5" />
      <div style={{ marginTop: 34, fontFamily: font.mono, fontSize: 30, color: "#7d8590" }}>{p.repo}</div>
      <div style={{ marginTop: 14, fontSize: 72, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{p.title} <span style={{ color: "#7d8590", fontWeight: 400 }}>#{p.number}</span></div>
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 18, fontSize: 28, color: "#7d8590" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, background: pill, color: "#fff", fontWeight: 700, padding: "10px 22px", borderRadius: 40, transform: `scale(${0.8 + 0.2 * prog(t, at + 0.4, 0.3, easeOut)})` }}>{state === "merged" ? "Merged" : state === "open" ? "Open" : "Closed"}</span>
        {p.author ? <span><b style={{ color: "#e6edf3" }}>{p.author}</b> {state === "merged" ? "merged this pull request" : "opened this pull request"}</span> : null}
      </div>
      <div style={{ flex: 1 }} />
      {adds + dels ? (
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: font.mono, fontSize: 34, borderTop: "1px solid #30363d", paddingTop: 26 }}>
          <span style={{ color: "#3fb950" }}>+{Math.round(adds * n)}</span><span style={{ color: "#f85149" }}>−{Math.round(dels * n)}</span>
          <span style={{ display: "flex", gap: 5 }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 20, height: 20, background: i < green ? "#3fb950" : "#f85149", opacity: prog(t, at + 0.6 + i * 0.08, 0.2, easeOut) }} />)}</span>
          {p.files ? <span style={{ color: "#7d8590", fontSize: 28 }}>{p.files} files changed</span> : null}
        </div>
      ) : null}
      {p.note ? <div style={{ marginTop: 22, fontSize: 32, color: "#e6edf3", opacity: prog(t, at + 1, 0.4, easeOut) }}>{p.note}</div> : null}
    </div>
  );
};

const ChartPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "chart" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  const cw = 1040, ch = 330;
  const min = Math.min(...p.series), max = Math.max(...p.series), span = max - min || 1;
  const pts = p.series.map((v, i) => [(i / (p.series.length - 1)) * cw, ch - ((v - min) / span) * (ch - 20) - 10] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const draw = prog(t, at + 0.4, 1.6, easeInOut);
  const up = p.series[p.series.length - 1]! >= p.series[0]!;
  const line = up ? "#35d07f" : "#ff5b5b";
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? compact(v) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(2));
  const [lx, ly] = pts[pts.length - 1]!;
  const id = `c${Math.round(at * 100)}`;
  return (
    <div style={{ width: "100%", height: "100%", background: "linear-gradient(180deg, #0c1424, #070b14)", padding: "44px 56px", boxSizing: "border-box", color: "#fff", fontFamily: font.ui }}>
      <PanelHeader tag="MARKETS" illustrative={p.illustrative} accent={line} />
      <div style={{ marginTop: 26, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontSize: 40, fontWeight: 700, maxWidth: 700, lineHeight: 1.15 }}>{p.label}</div>
        {p.value ? <div style={{ textAlign: "right" }}><div style={{ fontFamily: font.display, fontWeight: 800, fontSize: 96, lineHeight: 1, color: line }}>{countUp(p.value, prog(t, at + 0.4, 1.4, easeOut))}</div>{p.note ? <div style={{ fontSize: 26, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>{p.note}</div> : null}</div> : null}
      </div>
      <svg width={cw + 100} height={ch + 30} style={{ marginTop: 30, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}a`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={line} stopOpacity={0.35} /><stop offset="1" stopColor={line} stopOpacity={0} /></linearGradient>
          <clipPath id={`${id}k`}><rect x={-10} y={-20} width={cw * draw + 12} height={ch + 40} /></clipPath>
        </defs>
        {[0, 1, 2, 3].map((i) => <line key={i} x1={0} x2={cw} y1={10 + (i * (ch - 20)) / 3} y2={10 + (i * (ch - 20)) / 3} stroke="rgba(255,255,255,0.08)" />)}
        <g clipPath={`url(#${id}k)`}>
          <path d={`${d} L${cw},${ch} L0,${ch} Z`} fill={`url(#${id}a)`} />
          <path d={d} fill="none" stroke={line} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {draw > 0.98 ? <circle cx={lx} cy={ly} r={10 + 4 * Math.abs(Math.sin(t * 3))} fill={line} /> : null}
        <text x={cw + 18} y={18} fill="rgba(255,255,255,0.6)" fontSize={22} fontFamily={font.mono}>{fmt(max)}</text>
        <text x={cw + 18} y={ch} fill="rgba(255,255,255,0.6)" fontSize={22} fontFamily={font.mono}>{fmt(min)}</text>
      </svg>
    </div>
  );
};

const StatsPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "stats" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  return (
    <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${NAVY2}, ${NAVY})`, padding: "44px 56px", boxSizing: "border-box", color: "#fff", fontFamily: font.ui, display: "flex", flexDirection: "column" }}>
      <PanelHeader tag={p.title?.toUpperCase() ?? "BY THE NUMBERS"} illustrative={p.illustrative} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 36 }}>
        {p.items.map(({ value, label }, i) => {
          const item = { value: shortFigure(value), label };
          const a = at + 0.3 + i * 0.35;
          // Fit the figure to its column (display digits run about 0.62 em wide).
          const column = (MATERIAL.w - 112 - 36 * (p.items.length - 1)) / p.items.length - 34;
          const size = Math.min(104, Math.floor(column / (item.value.length * 0.62)));
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, opacity: prog(t, a, 0.4, easeOut), transform: `translateY(${(1 - prog(t, a, 0.5, easeOut)) * 40}px)`, borderLeft: `6px solid ${i ? "rgba(255,255,255,0.25)" : color.brand}`, paddingLeft: 28 }}>
              <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{countUp(item.value, prog(t, a, 1.2, easeOut))}</div>
              <div style={{ marginTop: 16, fontSize: 30, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PostPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "post" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  const n = prog(t, at + 0.8, 1.4, easeOut);
  return (
    <div style={{ width: "100%", height: "100%", background: "#000", padding: "44px 64px", boxSizing: "border-box", color: "#e7e9ea", fontFamily: font.ui, display: "flex", flexDirection: "column" }}>
      <PanelHeader tag="X · POST" illustrative={p.illustrative} accent="#e7e9ea" />
      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 24 }}>
        <div style={{ width: 96, height: 96, borderRadius: 48, background: `hsl(${hue(p.handle)} 55% 45%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, fontWeight: 800, color: "#fff" }}>{p.author.replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
        <div>
          <div style={{ fontSize: 38, fontWeight: 800 }}>{p.author}</div>
          <div style={{ fontSize: 30, color: "#71767b" }}>{p.handle}{p.time ? ` · ${p.time}` : ""}</div>
        </div>
      </div>
      <div style={{ marginTop: 40, fontSize: p.text.length > 120 ? 50 : 60, lineHeight: 1.3, fontWeight: 500, opacity: prog(t, at + 0.3, 0.5, easeOut) }}>{p.text}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 60, fontSize: 30, color: "#71767b", borderTop: "1px solid #2f3336", paddingTop: 24 }}>
        {p.reposts !== undefined ? <span>⟲ {compact(p.reposts * n)} reposts</span> : null}
        {p.likes !== undefined ? <span style={{ color: "#f91880" }}>♥ {compact(p.likes * n)} likes</span> : null}
      </div>
    </div>
  );
};

const PodcastPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "podcast" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  return (
    <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #2a1147, #120822)", padding: "44px 56px", boxSizing: "border-box", color: "#fff", fontFamily: font.ui, display: "flex", flexDirection: "column" }}>
      <PanelHeader tag="PODCAST" illustrative={p.illustrative} accent="#b57bff" />
      <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 30 }}>
        <div style={{ width: 150, height: 150, flex: "none", borderRadius: 16, background: `linear-gradient(135deg, hsl(${hue(p.show)} 70% 55%), #2a1147)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64, fontWeight: 800 }}>{p.show.slice(0, 1)}</div>
        <div>
          <div style={{ fontSize: 30, color: "#c9a8ff", fontWeight: 700, letterSpacing: "0.04em" }}>{p.show}</div>
          <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.15, marginTop: 8, maxWidth: 880 }}>{p.episode}</div>
        </div>
      </div>
      <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 6, height: 90 }}>
        {Array.from({ length: 64 }, (_, i) => <div key={i} style={{ width: 10, borderRadius: 5, background: i < 64 * (((t - at) / 8) % 1) ? "#b57bff" : "rgba(255,255,255,0.25)", height: 16 + 70 * Math.abs(Math.sin(i * 1.7 + t * 5) * Math.sin(i * 0.37)) }} />)}
        {p.minute ? <span style={{ marginLeft: 20, fontFamily: font.mono, fontSize: 28, color: "rgba(255,255,255,0.7)" }}>▶ {p.minute}</span> : null}
      </div>
      <div style={{ marginTop: 30, fontSize: 42, lineHeight: 1.3, fontStyle: "italic", opacity: prog(t, at + 0.6, 0.6, easeOut) }}>“{p.quote}”</div>
    </div>
  );
};

const ListPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "list" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  return (
    <div style={{ width: "100%", height: "100%", background: "#f6f5f1", padding: "44px 60px", boxSizing: "border-box", color: INK, fontFamily: font.ui, display: "flex", flexDirection: "column" }}>
      <PanelHeader tag="EXPLAINER" dark={false} illustrative={p.illustrative} />
      <div style={{ marginTop: 28, fontFamily: font.display, fontSize: 68, fontWeight: 800, letterSpacing: "-0.02em" }}>{p.title}</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
        {p.items.map((item, i) => {
          const a = at + 0.5 + i * 0.45;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, fontSize: 50, fontWeight: 600, lineHeight: 1.15, opacity: prog(t, a, 0.35, easeOut), transform: `translateX(${(1 - prog(t, a, 0.45, easeOut)) * 60}px)` }}>
              <span style={{ width: 64, height: 64, flex: "none", borderRadius: 10, background: color.brand, color: INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontSize: 32, fontWeight: 700 }}>{i + 1}</span>{item}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const QuotePanel: React.FC<{ p: Extract<NewscastPanel, { kind: "quote" }>; at: number }> = ({ p, at }) => {
  const t = useTime();
  return (
    <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${NAVY2}, ${NAVY})`, padding: "44px 70px", boxSizing: "border-box", color: "#fff", fontFamily: font.display, display: "flex", flexDirection: "column" }}>
      <PanelHeader tag="QUOTE" illustrative={p.illustrative} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 180, lineHeight: 0.6, color: color.brand }}>“</div>
        <div style={{ fontSize: p.text.length > 110 ? 50 : 62, fontWeight: 700, lineHeight: 1.2, opacity: prog(t, at + 0.3, 0.6, easeOut) }}>{p.text}</div>
        <div style={{ marginTop: 28, fontFamily: font.ui, fontSize: 32, color: "rgba(255,255,255,0.75)" }}>— {p.source}</div>
      </div>
    </div>
  );
};

const MediaPanel: React.FC<{ p: Extract<NewscastPanel, { kind: "image" | "video" }>; start: number }> = ({ p, start }) => {
  const { fps } = useVideoConfig();
  const t = useTime();
  return (
    <div style={{ width: "100%", height: "100%", background: "#000", position: "relative" }}>
      {p.kind === "image"
        ? <Img src={staticFile(p.src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.02 + 0.05 * prog(t, start, 8, (n) => n)})` }} />
        : <Sequence from={Math.round(start * fps)} layout="none"><OffthreadVideo src={staticFile(p.src)} startFrom={Math.round((p.fromSeconds ?? 0) * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></Sequence>}
      {p.caption ? <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "60px 40px 26px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))", color: "#fff", fontFamily: font.ui, fontSize: 32, fontWeight: 600 }}>{p.caption}</div> : null}
      {p.illustrative ? <div style={{ position: "absolute", top: 24, right: 24, fontFamily: font.mono, fontSize: 16, letterSpacing: "0.18em", color: "#fff", padding: "5px 10px", background: "rgba(0,0,0,0.5)", borderRadius: 4 }}>ILLUSTRATIVE</div> : null}
    </div>
  );
};

const Panel: React.FC<{ p: NewscastPanel; at: number }> = ({ p, at }) => {
  switch (p.kind) {
    case "pr": return <PrPanel p={p} at={at} />;
    case "chart": return <ChartPanel p={p} at={at} />;
    case "stats": return <StatsPanel p={p} at={at} />;
    case "post": return <PostPanel p={p} at={at} />;
    case "podcast": return <PodcastPanel p={p} at={at} />;
    case "list": return <ListPanel p={p} at={at} />;
    case "quote": return <QuotePanel p={p} at={at} />;
    default: return <MediaPanel p={p} start={at} />;
  }
};

/** The material box: panels in turn across the segment, each pushed in from the right. */
const Material: React.FC<{ s: Seg }> = ({ s }) => {
  const t = useTime();
  const panels = s.material ?? [];
  if (s.layout !== "split" || !panels.length || t < s.start || t > s.end) return null;
  const first = s.start + 0.35;
  const slot = (s.end - 0.4 - first) / panels.length;
  const box = prog(t, s.start + 0.2, 0.55, easeOut);
  return (
    <div style={{ position: "absolute", left: MATERIAL.x, top: MATERIAL.y, width: MATERIAL.w, height: MATERIAL.h, overflow: "hidden", background: "#050810", boxShadow: "0 30px 70px rgba(0,0,0,0.45)", transform: `translateX(${(1 - box) * 160}px)`, opacity: box }}>
      {panels.map((p, i) => {
        const at = first + i * slot;
        if (t < at - 0.05 || (i < panels.length - 1 && t > at + slot + 0.6)) return null;
        const push = i ? prog(t, at, 0.55, easeInOut) : 1;
        return <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - push) * 100}%)`, boxShadow: i ? "-30px 0 60px rgba(0,0,0,0.5)" : undefined }}><Panel p={p} at={at} /></div>;
      })}
    </div>
  );
};

/** Channel band: desk tab, headline, presenter, and the LIVE / logo / clock block on the right. */
const Band: React.FC<{ spec: NewscastSpec; T: Timeline; segs: Seg[] }> = ({ spec, T, segs }) => {
  const t = useTime();
  const show = prog(t, T.intro + 0.15, 0.5, easeOut) * (1 - prog(t, T.outro - 0.3, 0.3, easeInOut));
  const s = segs.find((x) => t >= x.start && t < x.end);
  if (show <= 0 || !s) return null;
  const inText = prog(t, s.start + 0.35, 0.45, easeOut);
  const pulse = 0.45 + 0.55 * Math.abs(Math.sin(t * Math.PI));
  const [hh, mm] = (spec.show.time ?? "20:00").split(":").map(Number);
  const secs = (hh ?? 20) * 3600 + (mm ?? 0) * 60 + Math.floor(Math.max(0, t - T.intro));
  const clock = `${String(Math.floor(secs / 3600) % 24).padStart(2, "0")}:${String(Math.floor(secs / 60) % 60).padStart(2, "0")}`;
  const words = spec.show.name.split(" ");
  const last = words.pop() ?? "";
  const title = s.title ?? "";
  return (
    <div style={{ position: "absolute", left: ANCHOR.x, right: W - MATERIAL.x - MATERIAL.w, top: BAND_Y, height: BAND_H, opacity: show, transform: `translateY(${(1 - show) * 40}px)` }}>
      <div style={{ position: "absolute", left: 0, top: -54, height: 54, display: "flex", alignItems: "center", padding: "0 26px", background: LIVE_RED, color: "#fff", fontFamily: font.display, fontWeight: 800, fontSize: 34, letterSpacing: "0.04em", clipPath: `inset(0 ${(1 - inText) * 100}% 0 0)` }}>{s.desk ?? "TOP STORIES"}</div>
      <div style={{ position: "absolute", inset: 0, right: 250, background: "#fafaf7", boxShadow: "0 18px 50px rgba(0,0,0,0.4)", padding: "20px 34px 0", boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: title.length > 40 ? 52 : 60, lineHeight: 1.05, letterSpacing: "-0.015em", color: INK, textTransform: "uppercase", transform: `translateY(${(1 - inText) * 60}px)`, opacity: inText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {s.presenter ? <div style={{ marginTop: 14, fontFamily: font.ui, fontWeight: 700, fontSize: 26, letterSpacing: "0.1em", color: "rgba(16,19,26,0.62)", opacity: prog(t, s.start + 0.6, 0.4, easeOut) }}>{s.presenter}{s.desk ? <span style={{ color: LIVE_RED }}>{`  ·  ${s.desk} DESK`}</span> : null}</div> : null}
      </div>
      <div style={{ position: "absolute", right: 0, top: -54, width: 250, height: 54, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: LIVE_RED, color: "#fff", fontFamily: font.display, fontWeight: 800, fontSize: 34, letterSpacing: "0.08em" }}>
        <span style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", opacity: pulse }} />LIVE
      </div>
      <div style={{ position: "absolute", right: 0, top: 0, width: 250, height: BAND_H, background: "#fff", borderLeft: "1px solid rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 18px 50px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font.display, fontWeight: 800, fontSize: 24, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
          <span style={{ color: INK }}>{words.join(" ")}</span><span style={{ color: INK, background: color.brand, padding: "0 8px 2px", borderRadius: 4 }}>{last}</span>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 700, color: INK }}>{clock} <span style={{ color: LIVE_RED }}>{spec.show.zone ?? "UTC"}</span></div>
      </div>
    </div>
  );
};

const Ticker: React.FC<{ spec: NewscastSpec; T: Timeline }> = ({ spec, T }) => {
  const t = useTime();
  const items = spec.ticker ?? [];
  const show = prog(t, T.intro + 0.2, 0.5, easeOut) * (1 - prog(t, T.outro - 0.3, 0.3, easeInOut));
  if (!items.length || show <= 0) return null;
  const text = items.join("   ◆   ");
  const run = Math.max(0, t - T.intro) * 150;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: TICKER_H, display: "flex", background: "#05070d", transform: `translateY(${(1 - show) * 90}px)` }}>
      <div style={{ zIndex: 1, display: "flex", alignItems: "center", padding: "0 28px", background: "#fff", color: INK, fontFamily: font.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.14em" }}>{spec.show.date}</div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, display: "flex", alignItems: "center", whiteSpace: "nowrap", transform: `translateX(${W - run}px)`, fontFamily: font.display, fontWeight: 700, fontSize: 36, letterSpacing: "0.01em", color: "#fff", textTransform: "uppercase" }}>
          {`${text}   ◆   ${text}   ◆   ${text}`}
        </div>
      </div>
    </div>
  );
};

const Closing: React.FC<{ spec: NewscastSpec; T: Timeline }> = ({ spec, T }) => {
  const t = useTime();
  if (t < T.outro - 0.05) return null;
  const words = spec.show.name.split(" ");
  const last = words.pop() ?? "";
  const inP = prog(t, T.outro + 0.2, 0.6, easeOut);
  const line = prog(t, T.outro + 0.8, 0.5, easeOut);
  return (
    <AbsoluteFill>
      <Backdrop seed={9} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, transform: `scale(${0.9 + 0.1 * inP})`, opacity: inP }}>
          <span style={{ fontFamily: font.display, fontWeight: 800, fontSize: 124, color: "#fff", letterSpacing: "-0.02em" }}>{words.join(" ")}</span>
          <span style={{ fontFamily: font.display, fontWeight: 800, fontSize: 124, color: INK, background: color.brand, padding: "0 22px 6px", borderRadius: 8 }}>{last}</span>
        </div>
        <div style={{ marginTop: 34, fontFamily: font.display, fontWeight: 600, fontSize: 44, color: "rgba(255,255,255,0.88)", opacity: line, transform: `translateY(${(1 - line) * 16}px)` }}>{spec.outro?.line ?? "See you tomorrow"}</div>
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 64, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 14, opacity: prog(t, T.outro + 1.2, 0.5, easeOut), fontFamily: font.ui, fontSize: 22, color: "rgba(255,255,255,0.55)" }}>
        Made with <Img src={staticFile("brand/attelier-logo-white.svg")} style={{ height: 30 }} />
      </div>
    </AbsoluteFill>
  );
};

export const Newscast: React.FC<NewscastSpec> = (spec) => {
  // The toolkit's prepare step fills every segment's seconds from the probed clip.
  const T = newscastTimeline(spec);
  const cuts = [T.intro, ...T.segments.slice(0, -1).map((s) => s.end), T.outro];
  const segs = T.segments.map((s) => ({ ...s, layout: s.layout ?? "full" })) as Seg[];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {segs.map((s, i) => <Presenter key={i} s={s} name={spec.show.name} />)}
      {segs.map((s, i) => <Material key={`m${i}`} s={s} />)}
      <Band spec={spec} T={T} segs={segs} />
      <Ticker spec={spec} T={T} />
      <TitleSequence spec={spec} T={T} />
      <Closing spec={spec} T={T} />
      {cuts.map((at, i) => <Wipe key={`w${i}`} at={at} />)}
      <Sfx src="sfx/news-open.mp3" at={0} volume={0.9} />
      {cuts.slice(1, -1).map((at, i) => <Sfx key={`t${i}`} src="sfx/news-transition.mp3" at={at - 0.35} volume={0.35} />)}
      <Sfx src="sfx/news-close.mp3" at={T.outro - 0.2} volume={0.8} />
    </AbsoluteFill>
  );
};
