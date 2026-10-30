/**
 * Page backgrounds (TASKS.md goal 7): solid colour, gradient preset or a
 * photo from the album. Pure data + helpers shared by the preview and PDF.
 */

export type GradientPresetId =
  | "light"
  | "topSpotlight"
  | "medium"
  | "bottomSpotlight"
  | "warm"
  | "nightfall";

export interface GradientPreset {
  id: GradientPresetId;
  name: string;
  from: string;
  to: string;
  /** CSS angle: 0 = to top, 90 = to right, 180 = to bottom. */
  angle: number;
}

/** PowerPoint-like default gradients (see work.md entry 4). */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  { id: "light", name: "Light gradient", from: "#ffffff", to: "#e7e6e6", angle: 135 },
  { id: "topSpotlight", name: "Top spotlight", from: "#ffffff", to: "#7f7f7f", angle: 180 },
  { id: "medium", name: "Medium gradient", from: "#1f3864", to: "#9dc3e6", angle: 90 },
  { id: "bottomSpotlight", name: "Bottom spotlight", from: "#ffffff", to: "#2e75b6", angle: 0 },
  { id: "warm", name: "Warm accent", from: "#ffd6a5", to: "#b23a2e", angle: 45 },
  { id: "nightfall", name: "Nightfall", from: "#141e30", to: "#243b55", angle: 135 },
];

export type BackgroundSpec =
  | { type: "color"; color: string }
  | { type: "gradient"; preset: GradientPresetId }
  | { type: "photo"; assetId: string; dim: number };

export const DEFAULT_BACKGROUND: BackgroundSpec = {
  type: "color",
  color: "#ffffff",
};

export function gradientPreset(
  id: GradientPresetId,
): GradientPreset {
  return GRADIENT_PRESETS.find((preset) => preset.id === id) ?? GRADIENT_PRESETS[0];
}

/** Style for the HTML preview background layer. */
export interface PreviewBackgroundStyle {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
}

/**
 * CSS for a page background. `photoUrl` is only needed for photo backgrounds;
 * without it the page falls back to white.
 */
export function backgroundCss(
  spec: BackgroundSpec,
  photoUrl?: string,
): PreviewBackgroundStyle {
  if (spec.type === "color") {
    return { backgroundColor: spec.color };
  }
  if (spec.type === "gradient") {
    const preset = gradientPreset(spec.preset);
    return {
      backgroundImage: `linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})`,
    };
  }
  if (!photoUrl) {
    return { backgroundColor: "#ffffff" };
  }
  const dim = Math.min(1, Math.max(0, spec.dim));
  return {
    backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${photoUrl}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

/** Gradient data for the PDF renderer (SVG linear gradient). */
export interface PdfGradient {
  from: string;
  to: string;
  angle: number;
}

export function pdfGradient(spec: BackgroundSpec): PdfGradient | null {
  if (spec.type !== "gradient") return null;
  const preset = gradientPreset(spec.preset);
  return { from: preset.from, to: preset.to, angle: preset.angle };
}

/** Parse #rgb / #rrggbb into 0..1 channels; invalid input is treated as white. */
function parseColor(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16) / 255,
      parseInt(hex[1] + hex[1], 16) / 255,
      parseInt(hex[2] + hex[2], 16) / 255,
    ];
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255,
    ];
  }
  return [1, 1, 1];
}

function relativeLuminance(color: string): number {
  const [r, g, b] = parseColor(color).map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Default text colour for a background: dark text on light backgrounds,
 * white on dark backgrounds and photos.
 */
export function preferredTextColor(spec: BackgroundSpec): string {
  if (spec.type === "photo") return "#ffffff";
  if (spec.type === "color") {
    return relativeLuminance(spec.color) > 0.55 ? "#111827" : "#ffffff";
  }
  const preset = gradientPreset(spec.preset);
  const average =
    (relativeLuminance(preset.from) + relativeLuminance(preset.to)) / 2;
  return average > 0.55 ? "#111827" : "#ffffff";
}

/** Human-readable label for selectors and summaries. */
export function backgroundLabel(spec: BackgroundSpec): string {
  if (spec.type === "color") return `Colour ${spec.color}`;
  if (spec.type === "gradient") return gradientPreset(spec.preset).name;
  return "Photo";
}
