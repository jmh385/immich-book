/**
 * Page layout presets for photo books (TASKS.md goal 5).
 *
 * Each preset is a partition of the content area into photo slots. Slots are
 * normalized (0..1, origin top-left) and converted to pixels with real
 * gutters taken from the layout spacing, so preview and PDF share geometry.
 */

export type PageLayoutPreset =
  | "auto"
  | "full"
  | "two"
  | "twoStacked"
  | "featureOne"
  | "featureTwo"
  | "three"
  | "bannerThree"
  | "four"
  | "five"
  | "six";

/** Normalized slot: [x, y, width, height] in 0..1 of the content area. */
export type NormalizedSlot = readonly [number, number, number, number];

export interface LayoutPresetDefinition {
  id: Exclude<PageLayoutPreset, "auto">;
  name: string;
  /** Slots partition the content area without gutters; gaps are applied later. */
  slots: readonly NormalizedSlot[];
}

/** Presets inspired by common photo-book grids (see work.md entry 4). */
export const LAYOUT_PRESETS: readonly LayoutPresetDefinition[] = [
  {
    id: "full",
    name: "Full page",
    slots: [[0, 0, 1, 1]],
  },
  {
    id: "two",
    name: "Two side by side",
    slots: [
      [0, 0, 0.5, 1],
      [0.5, 0, 0.5, 1],
    ],
  },
  {
    id: "twoStacked",
    name: "Two stacked",
    slots: [
      [0, 0, 1, 0.5],
      [0, 0.5, 1, 0.5],
    ],
  },
  {
    id: "featureOne",
    name: "Large + one",
    slots: [
      [0, 0, 2 / 3, 1],
      [2 / 3, 0, 1 / 3, 1],
    ],
  },
  {
    id: "featureTwo",
    name: "Large + two",
    slots: [
      [0, 0, 2 / 3, 1],
      [2 / 3, 0, 1 / 3, 0.5],
      [2 / 3, 0.5, 1 / 3, 0.5],
    ],
  },
  {
    id: "three",
    name: "Three across",
    slots: [
      [0, 0, 1 / 3, 1],
      [1 / 3, 0, 1 / 3, 1],
      [2 / 3, 0, 1 / 3, 1],
    ],
  },
  {
    id: "bannerThree",
    name: "Banner + three",
    slots: [
      [0, 0, 1, 2 / 3],
      [0, 2 / 3, 1 / 3, 1 / 3],
      [1 / 3, 2 / 3, 1 / 3, 1 / 3],
      [2 / 3, 2 / 3, 1 / 3, 1 / 3],
    ],
  },
  {
    id: "four",
    name: "Four grid",
    slots: [
      [0, 0, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ],
  },
  {
    id: "five",
    name: "Five collage",
    slots: [
      [0, 0, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0, 0.5, 1 / 3, 0.5],
      [1 / 3, 0.5, 1 / 3, 0.5],
      [2 / 3, 0.5, 1 / 3, 0.5],
    ],
  },
  {
    id: "six",
    name: "Six grid",
    slots: [
      [0, 0, 1 / 3, 0.5],
      [1 / 3, 0, 1 / 3, 0.5],
      [2 / 3, 0, 1 / 3, 0.5],
      [0, 0.5, 1 / 3, 0.5],
      [1 / 3, 0.5, 1 / 3, 0.5],
      [2 / 3, 0.5, 1 / 3, 0.5],
    ],
  },
];

export interface PresetSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function presetDefinition(
  preset: PageLayoutPreset,
): LayoutPresetDefinition | undefined {
  return LAYOUT_PRESETS.find((definition) => definition.id === preset);
}

/**
 * Slot rectangles in content-area pixels. A gutter of `spacing` pixels is
 * removed from every slot edge that is not on the content boundary.
 */
export function presetSlots(
  preset: Exclude<PageLayoutPreset, "auto">,
  contentWidth: number,
  contentHeight: number,
  spacing: number,
): PresetSlot[] {
  const definition = presetDefinition(preset);
  if (!definition) return [];

  return definition.slots.map(([nx, ny, nw, nh]) => {
    const onRightEdge = nx + nw >= 1;
    const onBottomEdge = ny + nh >= 1;
    const x = nx * contentWidth;
    const y = ny * contentHeight;
    return {
      x,
      y,
      width: Math.max(1, nw * contentWidth - (onRightEdge ? 0 : spacing)),
      height: Math.max(1, nh * contentHeight - (onBottomEdge ? 0 : spacing)),
    };
  });
}
