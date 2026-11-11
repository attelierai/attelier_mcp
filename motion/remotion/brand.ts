import { continueRender, delayRender, staticFile } from "remotion";

/** Attelier Studio tokens (attelier_app/frontend/src/app/tokens.css). */
export const color = {
  bg: "#f5f5f2",
  ink: "#292923",
  dim: "#62665c",
  faint: "#8a8c82",
  line: "#e5e5df",
  line2: "#d9d9d1",
  card: "#ffffff",
  card2: "#f0f0ec",
  brand: "#ff8f44",
  brandSoft: "#ffc86b",
  night: "#1c1c18",
};

/** Faces loaded from assets/brand/fonts: Bricolage (display), Inter (UI), JetBrains Mono (data). */
export const font = { display: "Bricolage", ui: "InterV", mono: "JetMono" };

const FACES: [string, string, string][] = [
  ["Bricolage", "brand/fonts/bricolage-grotesque-latin.woff2", "200 800"],
  ["InterV", "brand/fonts/inter-latin.woff2", "100 900"],
  ["JetMono", "brand/fonts/jetbrains-mono-latin.woff2", "100 800"],
];

let loading: Promise<void> | undefined;
/** Block rendering until the brand faces are ready so no frame uses a fallback font. */
export const loadBrandFonts = () => {
  if (typeof document === "undefined" || loading) return;
  const handle = delayRender("brand fonts");
  loading = Promise.all(
    FACES.map(([family, file, weight]) => new FontFace(family, `url(${staticFile(file)})`, { weight }).load().then((face) => {
      document.fonts.add(face);
    })),
  ).then(() => continueRender(handle));
};
