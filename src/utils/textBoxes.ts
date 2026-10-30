/**
 * Editable text boxes (TASKS.md goal 4).
 *
 * Every visible string is described by a `TextBox`: generated defaults come
 * from the page/photo geometry, and per-box overrides change text, position,
 * width, font, size, colour or alignment. Preview and PDF both render these
 * boxes, which also fixes the "text under the image" stacking bug (goal 6):
 * text boxes are drawn after photos.
 */

export type TextBoxKind = "caption" | "date" | "description";
export type TextAlign = "left" | "center" | "right";

/** Fonts available in both renderers (Roboto is registered for the PDF). */
export type TextFontFamily = "Roboto" | "Helvetica" | "Times-Roman" | "Courier";

export interface TextFontOption {
  id: TextFontFamily;
  label: string;
  /** CSS font stack for the HTML preview. */
  css: string;
}

export const TEXT_FONT_FAMILIES: readonly TextFontOption[] = [
  { id: "Roboto", label: "Roboto", css: "Roboto, sans-serif" },
  { id: "Helvetica", label: "Helvetica", css: "Helvetica, Arial, sans-serif" },
  { id: "Times-Roman", label: "Times", css: "'Times New Roman', serif" },
  { id: "Courier", label: "Courier", css: "'Courier New', monospace" },
];

export function fontCss(family: TextFontFamily): string {
  return TEXT_FONT_FAMILIES.find((font) => font.id === family)?.css ?? "sans-serif";
}

export interface TextBox {
  id: string;
  kind: TextBoxKind;
  text: string;
  /** Page pixels (300 DPI), top-left origin. */
  x: number;
  y: number;
  width: number;
  fontFamily: TextFontFamily;
  /** PDF points / preview pixels, matching the existing font-size setting. */
  fontSize: number;
  color: string;
  align: TextAlign;
  /** Optional overlay behind the text (dates/descriptions keep the old look). */
  backgroundColor?: string;
}

export interface TextBoxOverride {
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  fontFamily?: TextFontFamily;
  fontSize?: number;
  color?: string;
  align?: TextAlign;
  backgroundColor?: string;
  /** Hides the box without deleting its override. */
  hidden?: boolean;
}

/** Minimal asset shape needed to derive text. */
export interface TextBoxAsset {
  id: string;
  fileCreatedAt?: string;
  exifInfo?: { description?: string | null } | null;
}

export interface TextBoxPhoto {
  asset: TextBoxAsset;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageTextBoxInput {
  width: number;
  height: number;
  groupLabel?: string;
  photos: TextBoxPhoto[];
}

export interface PageTextBoxOptions {
  margin: number;
  fontSize: number;
  showDates: boolean;
  showDescriptions: boolean;
  /** Default colour, usually derived from the page background. */
  color: string;
  /** Current per-photo description position, defaults to "bottom". */
  descriptionPosition?: (assetId: string) => "bottom" | "top" | "left" | "right";
}

export function textBoxId(kind: TextBoxKind, assetId: string): string {
  return `${kind}:${assetId}`;
}

/** Human-readable label for the text inspector. */
export function textBoxLabel(box: TextBox): string {
  switch (box.kind) {
    case "caption":
      return "Group caption";
    case "date":
      return `Date · ${box.id.split(":")[1]}`;
    case "description":
      return `Description · ${box.id.split(":")[1]}`;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Default text boxes for one logical page, in page pixels. Overrides are not
 * applied here; call `resolveTextBoxes` afterwards.
 */
export function buildPageTextBoxes(
  page: PageTextBoxInput,
  options: PageTextBoxOptions,
): TextBox[] {
  const boxes: TextBox[] = [];
  const base = {
    fontFamily: "Roboto" as const,
    fontSize: options.fontSize,
    color: options.color,
  };

  if (page.groupLabel) {
    boxes.push({
      ...base,
      id: textBoxId("caption", page.photos[0]?.asset.id ?? "page"),
      kind: "caption",
      text: page.groupLabel,
      x: 0,
      y: page.height - options.margin / 2 - options.fontSize * 0.6,
      width: page.width,
      align: "center",
    });
  }

  for (const photo of page.photos) {
    const position = options.descriptionPosition?.(photo.asset.id) ?? "bottom";
    const description = photo.asset.exifInfo?.description;

    if (options.showDates && photo.asset.fileCreatedAt) {
      const width = Math.min(220, photo.width);
      boxes.push({
        ...base,
        id: textBoxId("date", photo.asset.id),
        kind: "date",
        text: formatDate(photo.asset.fileCreatedAt),
        color: "#111827",
        backgroundColor: "rgba(255,255,255,0.7)",
        x:
          position === "left"
            ? photo.x + 8
            : position === "right"
              ? photo.x + photo.width / 2 + 8
              : photo.x + photo.width - width,
        y:
          position === "top"
            ? photo.y + photo.height - options.fontSize * 1.8
            : photo.y + 8,
        width:
          position === "left" || position === "right"
            ? photo.width / 2 - 16
            : width,
        align: position === "left" || position === "right" ? "left" : "right",
      });
    }

    if (options.showDescriptions && description) {
      boxes.push({
        ...base,
        id: textBoxId("description", photo.asset.id),
        kind: "description",
        text: description,
        color: "#111827",
        backgroundColor: "rgba(255,255,255,0.7)",
        x:
          position === "right"
            ? photo.x + photo.width / 2 + 8
            : photo.x + 8,
        y:
          position === "bottom"
            ? photo.y + photo.height - options.fontSize * 1.8
            : photo.y + 8,
        width:
          position === "left" || position === "right"
            ? photo.width / 2 - 16
            : photo.width - 16,
        align: "left",
      });
    }
  }

  return boxes;
}

/**
 * Apply per-box overrides. A hidden box is removed; an empty text value keeps
 * the generated text; undefined override fields keep the default.
 */
export function resolveTextBoxes(
  boxes: TextBox[],
  overrides?: Record<string, TextBoxOverride>,
): TextBox[] {
  if (!overrides) return boxes;

  return boxes.flatMap((box) => {
    const override = overrides[box.id];
    if (!override) return [box];
    if (override.hidden) return [];

    const resolved: TextBox = { ...box };
    // An empty text field means "keep the generated text"; use `hidden` to
    // remove a box entirely.
    if (override.text !== undefined && override.text.trim() !== "") {
      resolved.text = override.text;
    }
    if (override.x !== undefined) resolved.x = override.x;
    if (override.y !== undefined) resolved.y = override.y;
    if (override.width !== undefined) resolved.width = override.width;
    if (override.fontFamily !== undefined) {
      resolved.fontFamily = override.fontFamily;
    }
    if (override.fontSize !== undefined) resolved.fontSize = override.fontSize;
    if (override.color !== undefined) resolved.color = override.color;
    if (override.align !== undefined) resolved.align = override.align;
    if (override.backgroundColor !== undefined) {
      resolved.backgroundColor = override.backgroundColor;
    }
    return [resolved];
  });
}
