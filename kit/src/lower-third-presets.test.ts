import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import {
  LOWER_THIRD_PRESETS,
  lowerThirdFontAssetIds,
  lowerThirdPresetProperties,
  trackedSmallCaps,
} from "./lower-third-presets.js";

const LANDSCAPE = { width: 1920, height: 1080 };
const VERTICAL = { width: 1080, height: 1920 };

test("the rule and the box never co-occur, and a box turns off the drop shadow", () => {
  for (const preset of LOWER_THIRD_PRESETS) {
    const { name } = lowerThirdPresetProperties({ canvas: LANDSCAPE, preset, name: "Frank Whitmore" });
    ok(!(name["text.boxed"] === true && name["style.rule.width"] !== undefined), `${preset} draws both a rule and a box`);
    if (name["text.boxed"] === true) strictEqual(name["style.shadowOpacity"], 0);
  }
});

test("pixel values scale with canvas width and positions follow the aspect", () => {
  const wide = lowerThirdPresetProperties({ canvas: LANDSCAPE, preset: "documentary-rule", name: "Name" }).name;
  const half = lowerThirdPresetProperties({ canvas: { width: 960, height: 540 }, preset: "documentary-rule", name: "Name" }).name;
  strictEqual(wide["style.fontSize"], 56);
  strictEqual(half["style.fontSize"], 28);
  strictEqual(half["style.rule.width"], 2);

  // A vertical crop may not use the bottom third: it stays above the
  // platform's interaction band.
  deepStrictEqual(wide["transform.position"], [0.08, 0.78]);
  const tall = lowerThirdPresetProperties({ canvas: VERTICAL, preset: "documentary-rule", name: "Name" }).name;
  deepStrictEqual(tall["transform.position"], [0.08, 0.72]);
});

test("a role is tracked to small caps on its own property set", () => {
  strictEqual(trackedSmallCaps("head of design"), "HEAD OF DESIGN");
  const { name, role } = lowerThirdPresetProperties({
    canvas: LANDSCAPE,
    preset: "documentary-box",
    name: "Frank Whitmore",
    role: "Curator",
  });
  ok(role);
  strictEqual(role["text.content"], trackedSmallCaps("Curator"));
  strictEqual(role["style.trackingEm"], 0.12);
  // The role never carries the box: one plate on the name covers both lines,
  // and two boxed elements would show a seam.
  strictEqual(role["text.boxed"], false);
  strictEqual(name["text.content"], "Frank Whitmore");
  strictEqual(lowerThirdPresetProperties({ canvas: LANDSCAPE, preset: "minimal", name: "Name" }).role, undefined);
});

test("project typefaces are used when the project carries them", () => {
  const assets = [
    { id: "asset-bricolage", name: "BricolageGrotesque-Regular.ttf", mediaType: "font" },
    { id: "asset-serif", name: "PlayfairDisplay-Regular.ttf", mediaType: "font" },
    { id: "asset-sans", name: "Inter-Regular.ttf", mediaType: "font" },
    { id: "asset-clip", name: "Playfair b-roll.mp4", mediaType: "video" },
  ];
  deepStrictEqual(lowerThirdFontAssetIds(assets), { name: "asset-bricolage", role: "asset-sans" });
  // Only one typeface present: it does both jobs rather than falling back to
  // the renderer default for one of them.
  deepStrictEqual(lowerThirdFontAssetIds([assets[2]!]), { name: "asset-sans", role: "asset-sans" });
  deepStrictEqual(lowerThirdFontAssetIds([]), {});
  strictEqual(
    lowerThirdPresetProperties({ canvas: LANDSCAPE, preset: "minimal", name: "Name", fonts: lowerThirdFontAssetIds(assets) }).name["style.fontAssetId"],
    "asset-bricolage",
  );
});
