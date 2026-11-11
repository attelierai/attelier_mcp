/**
 * Data-only graphic recipes shared by every editor surface.
 *
 * The compiler turns these layer declarations into ordinary editable text and
 * image elements. Keeping the authored look here prevents an agent from
 * inventing typography, placement or animation values on each call.
 */

export const GRAPHIC_TEMPLATE_IDS = [
  "lower-third/documentary-01",
  "title-card/plain",
  "title-card/documentary-01",
  "end-card/logo-line",
  "locator/place-date",
] as const;

export type GraphicTemplateId = typeof GRAPHIC_TEMPLATE_IDS[number];

export type GraphicTextLayerTemplate = {
  kind: "text";
  slot: string;
  optional?: boolean;
  fontSlot: string;
  fontFamilyPreferences: readonly string[];
  properties: Readonly<Record<string, unknown>>;
};

export type GraphicImageLayerTemplate = {
  kind: "image";
  assetSlot: string;
  properties: Readonly<Record<string, unknown>>;
};

export type GraphicLayerTemplate = GraphicTextLayerTemplate | GraphicImageLayerTemplate;

export type GraphicTemplate = {
  id: GraphicTemplateId;
  label: string;
  requiredSlots: readonly string[];
  defaultDurationSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  layers: readonly GraphicLayerTemplate[];
};

const readableText = {
  "effect.text.id": "atelier.text.readable-overlay",
  "effect.text.version": 1,
  "text.align": "left",
  "transform.opacity": 1,
  "transform.rotation": 0,
  "transform.scale": 1,
} as const;

export const GRAPHIC_TEMPLATES: Readonly<Record<GraphicTemplateId, GraphicTemplate>> = {
  "lower-third/documentary-01": {
    id: "lower-third/documentary-01",
    label: "Documentary lower third 01",
    requiredSlots: ["name", "role"],
    defaultDurationSeconds: 4,
    fadeInSeconds: 0.7,
    fadeOutSeconds: 0.7,
    layers: [
      {
        kind: "text",
        slot: "name",
        fontSlot: "name_font_asset_id",
        fontFamilyPreferences: ["Bricolage Grotesque", "Space Grotesk", "Inter"],
        properties: {
          ...readableText,
          "text.role": "label",
          "text.boxed": true,
          "style.fontFamily": "Bricolage",
          "style.fontSize": 46,
          "style.color": "#ffffff",
          "style.stroke": 0,
          "style.shadowOpacity": 0.3,
          "style.boxColor": "#000000",
          "style.boxOpacity": 0.55,
          "style.boxPadding": 20,
          "style.boxMinWidth": 760,
          "style.boxHeight": 128,
          "transform.position": [0.075, 0.79],
        },
      },
      {
        kind: "text",
        slot: "role",
        fontSlot: "role_font_asset_id",
        fontFamilyPreferences: ["Inter Medium", "Inter", "Space Grotesk"],
        properties: {
          ...readableText,
          "text.role": "label",
          "text.boxed": false,
          "style.fontFamily": "Inter",
          "style.fontSize": 24,
          "style.color": "#d6b46a",
          "style.shadowOpacity": 0.3,
          "transform.position": [0.075, 0.838],
        },
      },
    ],
  },
  "title-card/plain": {
    id: "title-card/plain",
    label: "Plain title card",
    requiredSlots: ["title"],
    defaultDurationSeconds: 4,
    fadeInSeconds: 0.25,
    fadeOutSeconds: 0.4,
    layers: [
      {
        kind: "text",
        slot: "title",
        fontSlot: "font_asset_id",
        fontFamilyPreferences: ["Inter", "Space Grotesk", "Bricolage Grotesque"],
        properties: {
          ...readableText,
          "text.align": "center",
          "text.role": "headline",
          "style.fontFamily": "Inter",
          "style.fontSize": 72,
          "style.fontWeight": 700,
          "style.lineHeight": 1.12,
          "style.color": "#FFFFFF",
          "style.shadowOpacity": 0.45,
          "transform.position": [0.5, 0.48],
        },
      },
      {
        kind: "text",
        slot: "subtitle",
        optional: true,
        fontSlot: "font_asset_id",
        fontFamilyPreferences: ["Inter", "Space Grotesk", "Bricolage Grotesque"],
        properties: {
          ...readableText,
          "text.align": "center",
          "text.role": "label",
          "style.fontFamily": "Inter",
          "style.fontSize": 36,
          "style.fontWeight": 500,
          "style.lineHeight": 1.18,
          "style.color": "#C9A227",
          "style.shadowOpacity": 0.35,
          "transform.position": [0.5, 0.58],
        },
      },
    ],
  },
  "title-card/documentary-01": {
    id: "title-card/documentary-01",
    label: "Documentary title card 01",
    requiredSlots: ["title"],
    defaultDurationSeconds: 4,
    fadeInSeconds: 0.7,
    fadeOutSeconds: 0.7,
    layers: [{
      kind: "text",
      slot: "title",
      fontSlot: "font_asset_id",
      fontFamilyPreferences: ["Bricolage Grotesque", "Space Grotesk", "Inter"],
      properties: {
        ...readableText,
        "text.role": "label",
        "text.boxed": true,
        "style.fontFamily": "Bricolage",
        "style.fontSize": 46,
        "style.color": "#ffffff",
        "style.stroke": 0,
        "style.shadowOpacity": 0.3,
        "style.boxColor": "#000000",
        "style.boxOpacity": 0.55,
        "style.boxPadding": 20,
        "transform.position": [0.075, 0.79],
      },
    }],
  },
  "end-card/logo-line": {
    id: "end-card/logo-line",
    label: "Logo, line and URL end card",
    requiredSlots: ["logo_asset_id", "line", "url"],
    defaultDurationSeconds: 5,
    fadeInSeconds: 0.3,
    fadeOutSeconds: 0.5,
    layers: [
      {
        kind: "image",
        assetSlot: "logo_asset_id",
        properties: {
          "transform.fit": "contain",
          "transform.scale": 0.22,
          "transform.position": [0.5, 0.38],
          "transform.opacity": 1,
        },
      },
      {
        kind: "text",
        slot: "line",
        fontSlot: "font_asset_id",
        fontFamilyPreferences: ["Inter", "Space Grotesk", "Bricolage Grotesque"],
        properties: {
          ...readableText,
          "text.align": "center",
          "text.role": "headline",
          "style.fontFamily": "Inter",
          "style.fontSize": 42,
          "style.fontWeight": 600,
          "style.lineHeight": 1.15,
          "style.color": "#FFFFFF",
          "transform.position": [0.5, 0.62],
        },
      },
      {
        kind: "text",
        slot: "url",
        fontSlot: "font_asset_id",
        fontFamilyPreferences: ["Inter", "Space Grotesk", "Bricolage Grotesque"],
        properties: {
          ...readableText,
          "text.align": "center",
          "text.role": "cta",
          "style.fontFamily": "Inter",
          "style.fontSize": 26,
          "style.fontWeight": 600,
          "style.lineHeight": 1.15,
          "style.trackingEm": 0.04,
          "style.color": "#C9A227",
          "transform.position": [0.5, 0.7],
        },
      },
    ],
  },
  "locator/place-date": {
    id: "locator/place-date",
    label: "Place and date locator",
    requiredSlots: ["place", "date"],
    defaultDurationSeconds: 3,
    fadeInSeconds: 0.2,
    fadeOutSeconds: 0.4,
    layers: [
      {
        kind: "text",
        slot: "place",
        fontSlot: "font_asset_id",
        fontFamilyPreferences: ["Inter", "Space Grotesk", "Bricolage Grotesque"],
        properties: {
          ...readableText,
          "text.role": "label",
          "style.fontFamily": "Inter",
          "style.fontSize": 34,
          "style.fontWeight": 700,
          "style.lineHeight": 1.15,
          "style.color": "#FFFFFF",
          "transform.position": [0.075, 0.12],
        },
      },
      {
        kind: "text",
        slot: "date",
        fontSlot: "font_asset_id",
        fontFamilyPreferences: ["Inter", "Space Grotesk", "Bricolage Grotesque"],
        properties: {
          ...readableText,
          "text.role": "label",
          "style.fontFamily": "Inter",
          "style.fontSize": 22,
          "style.fontWeight": 600,
          "style.lineHeight": 1.15,
          "style.trackingEm": 0.08,
          "style.color": "#C9A227",
          "transform.position": [0.075, 0.16],
        },
      },
    ],
  },
};

export const graphicTemplate = (id: string): GraphicTemplate | undefined =>
  Object.prototype.hasOwnProperty.call(GRAPHIC_TEMPLATES, id)
    ? GRAPHIC_TEMPLATES[id as GraphicTemplateId]
    : undefined;
