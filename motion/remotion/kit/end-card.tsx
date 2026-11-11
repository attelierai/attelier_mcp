import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { color, font } from "../brand";
import { easeInOut, easeOut, prog, useTime } from "./primitives";

export type Credit = { label: string; items: { text: string; logo?: string }[] };

/** Dark brand end card: circular wipe, the Attelier lockup, tagline joined by accent pluses, optional credits.
 *  Without tagline, cta or credits it is the logo alone (the attelier-outro format). */
export const BrandEndCard: React.FC<{ at: number; tagline?: string[]; background?: string; credits?: Credit[]; cta?: string }> = ({ at, tagline = [], background = color.night, credits = [], cta }) => {
  const t = useTime();
  if (t < at - 0.05) return null;
  const wipe = prog(t, at, 0.55, easeInOut);
  const logo = prog(t, at + 0.25, 0.7, easeOut);
  const line = prog(t, at + 0.7, 0.6, easeOut);
  return (
    <AbsoluteFill style={{ background, clipPath: `circle(${wipe * 120}% at 50% 55%)`, alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile("brand/attelier-logo-white.svg")} style={{ width: 820, opacity: logo, filter: `blur(${(1 - logo) * 18}px)`, transform: `scale(${0.9 + 0.1 * logo})`, marginTop: tagline.length || cta || credits.length ? -40 : 0 }} />
      {cta ? (
        <div style={{ marginTop: 54, fontFamily: font.display, fontWeight: 700, fontSize: 54, letterSpacing: "-0.02em", color: "#fff", opacity: line, transform: `translateY(${(1 - line) * 18}px)` }}>
          {cta.split(/(\[[^\]]+\])/).map((part, i) => part.startsWith("[") ? <span key={i} style={{ color: color.brand }}>{part.slice(1, -1)}</span> : <React.Fragment key={i}>{part}</React.Fragment>)}
        </div>
      ) : null}
      {tagline.length ? <div style={{ marginTop: cta ? 34 : 72, display: "flex", alignItems: "center", gap: 14, fontFamily: font.ui, fontSize: 26, fontWeight: 600, color: "rgba(255,255,255,0.78)", letterSpacing: "-0.01em", opacity: line, transform: `translateY(${(1 - line) * 18}px)`, filter: `blur(${(1 - line) * 8}px)` }}>
        {tagline.map((part, i) => (
          <React.Fragment key={part}>
            {i > 0 ? <span style={{ color: color.brand, fontSize: 30 }}>+</span> : null}
            <span>{part}</span>
          </React.Fragment>
        ))}
      </div> : null}
      {credits.length ? (
        <div style={{ marginTop: 44, display: "grid", gap: 12, justifyItems: "center", opacity: prog(t, at + 1.1, 0.5, easeOut) }}>
          {credits.map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 22, fontFamily: font.ui, fontSize: 21, color: "rgba(255,255,255,0.72)" }}>
              <span style={{ fontFamily: font.mono, fontSize: 15, letterSpacing: "0.3em", color: "rgba(255,255,255,0.4)", minWidth: 90, textAlign: "right" }}>{row.label.toUpperCase()}</span>
              {row.items.map((item, i) => (
                <React.Fragment key={item.text}>
                  {i > 0 ? <span style={{ color: "rgba(255,255,255,0.35)" }}>·</span> : null}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    {item.logo ? <Img src={staticFile(item.logo)} style={{ height: 24 }} /> : null}
                    {item.text}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
