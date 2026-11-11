// Attelier Create, recreated as an animatable UI demo: a prompt is typed into the
// real composer layout, models are ticked in the picker, Generate is pressed and
// the camera pulls out to the whole app. Geometry measured from /create/video.
import React from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { color, font } from "../brand";
import { clamp, easeInOut, easeOut, prog, useSpring, useTime } from "./primitives";

export type CreateDemoTiming = {
  createIn: number;
  typeStart: number;
  typeEnd: number;
  modelClick: number;
  checks: number[];
  pickerClose: number;
  send: number;
  zoomOut: number;
  zoomOutLen: number;
  /** Scene fades out from here. */
  exit: number;
  beat: number;
};

export type CreateDemoProps = {
  prompt: string;
  picks: { name: string; maker: string }[];
  extras: { name: string; maker: string }[];
  timing: CreateDemoTiming;
  /** Summary shown beside Generate once every pick is ticked. */
  summary: string;
};

const W = 1920;
const COMPOSER = { x: 436, y: 858, w: 1100, h: 196 };
const CHIP_Y = COMPOSER.y + 128;
const MODEL_CHIP = { x: 579, w: 200 };
const SEND = { x: COMPOSER.x + COMPOSER.w - 67, y: COMPOSER.y + 129, d: 50 };
const FOCUS = { x: COMPOSER.x + COMPOSER.w / 2, y: COMPOSER.y + COMPOSER.h / 2 - 90 };
const ZOOM = 1.45;

export const CreateDemo: React.FC<CreateDemoProps> = (props) => {
  const t = useTime();
  const T = props.timing;
  if (t < T.createIn - 0.1 || t > T.exit + 0.7) return null;
  const enter = prog(t, T.createIn, 0.45, easeOut);
  const fade = prog(t, T.exit, 0.45, easeInOut);
  const out = prog(t, T.zoomOut, T.zoomOutLen, easeInOut);
  const scale = interpolate(out, [0, 1], [ZOOM, 1]);
  const drift = (1 - out) * Math.sin(t * 0.9) * 6;
  const tx = (W / 2 - FOCUS.x * scale) * (1 - out) + drift;
  const ty = (540 - FOCUS.y * scale) * (1 - out);
  return (
    <AbsoluteFill style={{ opacity: enter * (1 - fade), filter: `blur(${(1 - enter) * 14 + fade * 10}px)` }}>
      <div style={{ position: "absolute", width: W, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <AppChrome />
        <Composer {...props} />
        <Picker {...props} />
        <Cursor {...props} />
      </div>
    </AbsoluteFill>
  );
};

const RailIcon: React.FC<{ y: number; active?: boolean; d: string }> = ({ y, active, d }) => (
  <div style={{ position: "absolute", left: 8, top: y, width: 36, height: 36, borderRadius: 10, background: active ? "#e2e3db" : "transparent", display: "grid", placeItems: "center" }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  </div>
);

const AppChrome: React.FC = () => (
  <AbsoluteFill style={{ background: color.bg }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: 52, height: 1080, background: color.bg, borderRight: `1px solid ${color.line}` }}>
      <RailIcon y={16} d="M4 6h16M4 12h10M4 18h16" />
      <RailIcon y={82} active d="M12 5v14M5 12h14" />
      <RailIcon y={122} d="M4 5h16v14H4zM4 9h16" />
      <RailIcon y={162} d="M5 4h14v16H5zM10 9l5 3-5 3z" />
      <RailIcon y={202} d="M6 6a2 2 0 1 0 0 .01M18 12a2 2 0 1 0 0 .01M6 18a2 2 0 1 0 0 .01M8 6h6l2 4M8 18h6l2-4" />
    </div>
    <div style={{ position: "absolute", left: 52, right: 0, top: 0, height: 64, borderBottom: `1px solid ${color.line}` }} />
    <div style={{ position: "absolute", left: 76, top: 91, height: 38, padding: 4, borderRadius: 14, background: color.card2, display: "flex", gap: 4, fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: color.dim }}>
      {["All", "Image", "Video", "Audio"].map((label) => (
        <div key={label} style={{ height: 30, padding: "0 16px", borderRadius: 11, display: "grid", placeItems: "center", background: label === "Video" ? color.ink : "transparent", color: label === "Video" ? "#fff" : color.dim }}>{label}</div>
      ))}
    </div>
    <div style={{ position: "absolute", right: 64, top: 16, height: 32, padding: "0 12px", borderRadius: 16, border: `1px solid ${color.line}`, display: "flex", alignItems: "center", gap: 6, fontFamily: font.ui, fontWeight: 700, fontSize: 14, color: color.ink }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: color.brand }} />100
    </div>
    <div style={{ position: "absolute", right: 24, top: 16, width: 32, height: 32, borderRadius: 16, background: color.ink, color: "#fff", display: "grid", placeItems: "center", fontFamily: font.ui, fontWeight: 700, fontSize: 11 }}>AT</div>
  </AbsoluteFill>
);

const Chip: React.FC<{ x: number; w: number; label: string; value: string; highlight?: number; spark?: boolean }> = ({ x, w, label, value, highlight = 0, spark }) => (
  <div style={{ position: "absolute", left: x - COMPOSER.x, top: CHIP_Y - COMPOSER.y, width: w, height: 50, borderRadius: 12, border: `1px solid ${highlight > 0 ? color.ink : color.line2}`, background: color.card, padding: "7px 14px", boxSizing: "border-box", boxShadow: highlight > 0 ? `0 0 0 ${3 * highlight}px ${color.brand}33` : undefined }}>
    <div style={{ fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: color.faint }}>{spark ? "✦ " : ""}{label}</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: color.ink, marginTop: 2 }}>
      <span>{value}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
    </div>
  </div>
);

const Composer: React.FC<CreateDemoProps> = ({ prompt, picks, timing: T, summary }) => {
  const t = useTime();
  const typed = Math.round(prompt.length * prog(t, T.typeStart, T.typeEnd - T.typeStart, Easing.linear));
  const caret = t < T.send && (Math.floor(t * 2.2) % 2 === 0 || (t > T.typeStart && t < T.typeEnd));
  const picked = T.checks.filter((c) => t >= c).length;
  const modelValue = picked <= 1 ? (picks[0]?.name ?? "Model") : `${picked} models`;
  const chipGlow = interpolate(t, [T.modelClick - 0.05, T.modelClick, T.pickerClose, T.pickerClose + 0.2], [0, 1, 1, 0], clamp);
  const press = interpolate(t, [T.send - 0.05, T.send, T.send + 0.14], [1, 0.84, 1], clamp);
  const ring = prog(t, T.send, 0.5, easeOut);
  return (
    <div style={{ position: "absolute", left: COMPOSER.x, top: COMPOSER.y, width: COMPOSER.w, height: COMPOSER.h, borderRadius: 22, border: `1.5px solid ${color.ink}`, background: color.card, boxShadow: "0 18px 50px rgba(35,38,28,0.10)", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", left: 20, top: 18, width: 36, height: 36, borderRadius: 18, border: `1px solid ${color.line2}`, background: color.card2, display: "grid", placeItems: "center", color: color.dim, fontSize: 20, fontFamily: font.ui }}>+</div>
      <div style={{ position: "absolute", left: 84, right: 60, top: 26, fontFamily: font.ui, fontSize: 23, lineHeight: 1.4, letterSpacing: "-0.01em", color: typed ? color.ink : color.faint }}>
        {typed ? prompt.slice(0, typed) : "Describe the video you want…"}
        {caret ? <span style={{ display: "inline-block", width: 2, height: 26, marginLeft: 2, verticalAlign: -5, background: color.brand }} /> : null}
      </div>
      <svg style={{ position: "absolute", right: 22, top: 24 }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.dim} strokeWidth="1.8" strokeLinecap="round"><path d="M4 20L16 8M14 4v3M18 8h3M17 3l1.5 1.5M20 11l-1.5-1.5" /></svg>
      <Chip x={457} w={112} label="TYPE" value="▭ Video" />
      <Chip x={MODEL_CHIP.x} w={MODEL_CHIP.w} label="MODEL" value={modelValue} highlight={chipGlow} spark />
      <Chip x={789} w={112} label="ASPECT" value="16:9" />
      <Chip x={911} w={112} label="DURATION" value="5s" />
      <div style={{ position: "absolute", left: SEND.x - COMPOSER.x - 150, top: SEND.y - COMPOSER.y + 14, fontFamily: font.ui, fontSize: 14, fontWeight: 600, color: color.dim, opacity: picked === picks.length ? 1 : 0 }}>{summary}</div>
      <div style={{ position: "absolute", left: SEND.x - COMPOSER.x, top: SEND.y - COMPOSER.y, width: SEND.d, height: SEND.d, borderRadius: SEND.d / 2, background: color.ink, display: "grid", placeItems: "center", transform: `scale(${press})`, boxShadow: ring > 0 && ring < 1 ? `0 0 0 ${ring * 22}px ${color.brand}${Math.round((1 - ring) * 150).toString(16).padStart(2, "0")}` : undefined }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </div>
    </div>
  );
};

const Picker: React.FC<CreateDemoProps> = ({ picks, extras, timing: T }) => {
  const t = useTime();
  const open = useSpring(T.modelClick, { damping: 16, stiffness: 220 });
  const close = prog(t, T.pickerClose, 0.22, Easing.in(Easing.cubic));
  if (t < T.modelClick || close >= 1) return null;
  const rows = [...picks.map((p, i) => ({ ...p, pick: i })), ...extras.map((p) => ({ ...p, pick: -1 }))];
  return (
    <div style={{ position: "absolute", left: MODEL_CHIP.x, bottom: 1080 - CHIP_Y + 14, width: 400, borderRadius: 18, border: `1px solid ${color.line2}`, background: color.card, boxShadow: "0 18px 48px rgba(35,38,28,0.16)", overflow: "hidden", transformOrigin: "20% 100%", opacity: Math.min(1, open * 1.5) * (1 - close), transform: `translateY(${(1 - open) * 16 + close * 8}px) scale(${0.94 + 0.06 * open})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 12px 16px", borderBottom: `1px solid ${color.line}`, fontFamily: font.ui }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: color.ink }}>Models</span>
        <div style={{ flex: 1, height: 32, borderRadius: 10, border: `1px solid ${color.line2}`, background: color.card2, fontSize: 13, color: color.faint, display: "flex", alignItems: "center", padding: "0 12px" }}>Search models</div>
      </div>
      <div style={{ padding: "8px 8px 10px" }}>
        <div style={{ padding: "6px 10px", fontFamily: font.ui, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: color.faint }}>TEXT TO VIDEO · COMPARE</div>
        {rows.map((row) => {
          const at = row.pick >= 0 ? T.checks[row.pick] : undefined;
          const on = at !== undefined && t >= at;
          const pop = at !== undefined ? interpolate(t, [at, at + 0.08, at + 0.2], [1, 1.25, 1], clamp) : 1;
          return (
            <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 12, height: 50, padding: "0 10px", borderRadius: 12, background: on ? color.card2 : "transparent", fontFamily: font.ui }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: row.pick >= 0 ? color.ink : color.card2, color: row.pick >= 0 ? "#fff" : color.faint, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{row.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: row.pick >= 0 ? color.ink : color.faint }}>{row.name}</div>
                <div style={{ fontSize: 12, color: color.faint }}>{row.maker}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${on ? color.brand : color.line2}`, background: on ? color.brand : "transparent", display: "grid", placeItems: "center", transform: `scale(${pop})` }}>
                {on ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Cursor: React.FC<CreateDemoProps> = ({ picks, extras, timing: T }) => {
  const t = useTime();
  if (t < T.typeEnd - 0.3 || t > T.send + T.beat * 2) return null;
  // Picker rows: header 57 + label 34 + 50 per row, anchored above the chip.
  const pickerTop = CHIP_Y - 14 - (57 + 34 + 18 + (picks.length + extras.length) * 50);
  const rowY = (i: number) => pickerTop + 57 + 34 + 8 + i * 50 + 25;
  const points: { at: number; x: number; y: number; click?: boolean }[] = [
    { at: T.typeEnd, x: 1180, y: 1040 },
    { at: T.modelClick, x: MODEL_CHIP.x + 120, y: CHIP_Y + 28, click: true },
    ...T.checks.map((at, i) => ({ at, x: MODEL_CHIP.x + 370, y: rowY(i), click: true })),
    { at: T.pickerClose, x: MODEL_CHIP.x + 370, y: rowY(T.checks.length - 1) },
    { at: T.send, x: SEND.x + 27, y: SEND.y + 28, click: true },
    { at: T.send + T.beat * 2, x: SEND.x + 140, y: SEND.y + 120 },
  ];
  let x = points[0]!.x, y = points[0]!.y, dip = 1;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const p = prog(t, a.at, Math.max(0.05, (b.at - a.at) * 0.7), easeInOut);
    if (t >= a.at) { x = a.x + (b.x - a.x) * p; y = a.y + (b.y - a.y) * p; }
  }
  for (const w of points) if (w.click) dip = Math.min(dip, interpolate(t, [w.at - 0.05, w.at, w.at + 0.1], [1, 0.8, 1], clamp));
  return (
    <svg style={{ position: "absolute", left: x, top: y, opacity: prog(t, T.typeEnd - 0.3, 0.25), transform: `scale(${dip})`, transformOrigin: "0 0", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))" }} width="26" height="30" viewBox="0 0 26 30">
      <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12 17 L20 17 Z" fill={color.ink} stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
};
