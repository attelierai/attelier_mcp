import React from "react";
import { color, font } from "../brand";
import { easeInOut, easeOut, prog, useTime } from "./primitives";

/** Visible length of a slam text, ignoring [highlight] brackets. */
export const plain = (text: string) => text.replace(/[[\]]/g, "");

/**
 * Heavy uppercase slam. Words in [brackets] turn brand orange with a thin
 * underline that draws in just after the slam lands.
 */
export const Slam: React.FC<{ text: string; at: number; size: number; color?: string; style?: React.CSSProperties }> = ({ text, at, size, color: fill = "#fff", style }) => {
  const t = useTime();
  if (t < at) return null;
  const p = prog(t, at, 0.18, easeOut);
  const mark = prog(t, at + 0.16, 0.28, easeInOut);
  return (
    <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: size, lineHeight: 0.9, letterSpacing: "-0.04em", textTransform: "uppercase", color: fill, opacity: Math.min(1, p * 2), filter: `blur(${(1 - p) * 16}px)`, transform: `scale(${1.35 - 0.35 * p})`, ...style }}>
      {text.split(/(\[[^\]]+\])/).map((part, i) =>
        part.startsWith("[") ? (
          <span key={i} style={{ color: color.brand, backgroundImage: `linear-gradient(${color.brand}, ${color.brand})`, backgroundRepeat: "no-repeat", backgroundPosition: "0 96%", backgroundSize: `${mark * 100}% 0.07em`, paddingBottom: "0.06em" }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </div>
  );
};
