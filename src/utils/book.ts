/**
 * Builds the pages of a photo book from an ordered asset stream:
 * grouping (TASKS.md goal 2), automatic layout styles (goal 1) and automatic
 * group captions (goal 3), then hands everything to the single layout engine
 * so the web preview and the PDF render the same book.
 *
 * Goals 4–7 extend each page with editable text boxes, a background and
 * per-page layout presets. Logical pages are laid out first, enriched, and
 * only then combined into sheets, so both halves keep their own settings.
 */

import type { AssetResponseDto } from "@immich/sdk";
import {
  calculatePageLayout,
  type LayoutOptions,
  type LayoutStyle,
  type Page,
  type PhotoBox,
} from "./pageLayout";
import {
  autoLayoutStyleFor,
  groupAssets,
  pickAutoCriteria,
  type GroupCriterion,
  type PhotoGroup,
} from "./photoGrouping";
import { formatGroupLabel } from "./groupLabel";
import {
  buildPageTextBoxes,
  resolveTextBoxes,
  type TextBox,
  type TextBoxOverride,
} from "./textBoxes";
import {
  DEFAULT_BACKGROUND,
  preferredTextColor,
  type BackgroundSpec,
} from "./backgrounds";
import type { PageLayoutPreset } from "./layoutPresets";

/** How the album is split into groups; "auto" picks criteria from the data. */
export type GroupingMode = "auto" | "off" | "day" | "location" | "person";

/** "auto" applies a style per group based on its size. */
export type LayoutStyleChoice = "auto" | LayoutStyle;

/** Description positions the layout engine already understands. */
export type DescriptionPosition = "bottom" | "top" | "left" | "right";

export interface BookLayoutOptions
  extends Omit<LayoutOptions, "groupBoundaries" | "segmentStyles" | "groupLabels"> {
  groupingMode: GroupingMode;
  layoutStyle: LayoutStyleChoice;
  /** Automatic group captions; off keeps the pages unlabeled. */
  showGroupLabels: boolean;
  /**
   * Manual caption overrides, keyed by `group.firstAssetId`. Blank entries
   * fall back to the generated caption. Only used when `showGroupLabels`.
   */
  labelOverrides?: Record<string, string>;
  /** Locale for generated date text, injectable for deterministic tests. */
  labelLocale?: string;

  // Text boxes (goal 4)
  showDates?: boolean;
  showDescriptions?: boolean;
  /** Base font size for generated text boxes; defaults to 12. */
  fontSize?: number;
  descriptionPosition?: (assetId: string) => DescriptionPosition;
  /** Per-box overrides keyed by text box id (`kind:assetId`). */
  textBoxOverrides?: Record<string, TextBoxOverride>;

  // Layout presets (goal 5)
  /** Per-page preset overrides keyed by the page's first asset id. */
  pageLayouts?: Record<string, PageLayoutPreset>;

  // Backgrounds (goal 7)
  /** Album-wide background; defaults to white. */
  defaultBackground?: BackgroundSpec;
  /** Per-page background overrides keyed by the page's first asset id. */
  pageBackgrounds?: Record<string, BackgroundSpec>;
}

/** One logical page before combining; exposed for the per-page settings UI. */
export interface BookLogicalPage {
  pageNumber: number;
  /** First asset id; key for per-page overrides. */
  anchorId: string | null;
  width: number;
  height: number;
  photos: PhotoBox[];
  groupLabel?: string;
  background: BackgroundSpec;
  textBoxes: TextBox[];
}

/** A rendered sheet: one logical page, or two combined side by side. */
export interface BookPage extends Page {
  /** One background per logical half (two only in combined mode). */
  backgrounds: BackgroundSpec[];
  /** Text boxes in sheet pixels; right-half boxes are already shifted. */
  textBoxes: TextBox[];
  /** First asset id of each logical half. */
  anchors: (string | null)[];
}

export interface BookLayout {
  pages: BookPage[];
  logicalPages: BookLogicalPage[];
  groups: PhotoGroup<AssetResponseDto>[];
  /** Layout style chosen for each group, in group order. */
  styles: LayoutStyle[];
  /** Caption generated for each group (null when none/disabled). */
  labels: (string | null)[];
}

/** Criteria used for a grouping mode; "off" means one group. */
export function criteriaForMode(
  mode: GroupingMode,
  assets: AssetResponseDto[],
): GroupCriterion[] {
  switch (mode) {
    case "off":
      return [];
    case "auto":
      return pickAutoCriteria(assets);
    case "day":
      return ["date"];
    case "location":
      return ["location"];
    case "person":
      return ["person"];
  }
}

/** Attach backgrounds and text boxes to one logical page. */
function enrichLogicalPage(
  page: Page,
  options: BookLayoutOptions,
): BookLogicalPage {
  const anchorId = page.photos[0]?.asset.id ?? null;
  const background =
    (anchorId ? options.pageBackgrounds?.[anchorId] : undefined) ??
    options.defaultBackground ??
    DEFAULT_BACKGROUND;

  const defaults = buildPageTextBoxes(page, {
    margin: options.margin,
    fontSize: options.fontSize ?? 12,
    showDates: options.showDates ?? true,
    showDescriptions: options.showDescriptions ?? true,
    color: preferredTextColor(background),
    descriptionPosition: options.descriptionPosition,
  });

  return {
    pageNumber: page.pageNumber,
    anchorId,
    width: page.width,
    height: page.height,
    photos: page.photos,
    groupLabel: page.groupLabel,
    background,
    textBoxes: resolveTextBoxes(defaults, options.textBoxOverrides),
  };
}

/** Pair logical pages into sheets when `combinePages` is on. */
function combineLogicalPages(logicalPages: BookLogicalPage[]): BookPage[] {
  const sheets: BookPage[] = [];

  for (let i = 0; i < logicalPages.length; i += 2) {
    const left = logicalPages[i];
    const right = logicalPages[i + 1];

    if (!right) {
      sheets.push({
        pageNumber: Math.floor(i / 2) + 1,
        photos: left.photos,
        width: left.width * 2,
        height: left.height,
        ...(left.groupLabel !== undefined
          ? { groupLabel: left.groupLabel }
          : {}),
        backgrounds: [left.background],
        textBoxes: left.textBoxes,
        anchors: [left.anchorId],
      });
      continue;
    }

    sheets.push({
      pageNumber: Math.floor(i / 2) + 1,
      photos: [
        ...left.photos,
        ...right.photos.map((photo) => ({
          ...photo,
          x: photo.x + left.width,
        })),
      ],
      width: left.width * 2,
      height: left.height,
      ...(left.groupLabel !== undefined
        ? { groupLabel: left.groupLabel }
        : {}),
      ...(right.groupLabel !== undefined
        ? { groupLabelRight: right.groupLabel }
        : {}),
      backgrounds: [left.background, right.background],
      textBoxes: [
        ...left.textBoxes,
        ...right.textBoxes.map((box) => ({ ...box, x: box.x + left.width })),
      ],
      anchors: [left.anchorId, right.anchorId],
    });
  }

  return sheets;
}

/**
 * Full book pipeline: group → choose styles → generate captions → paginate →
 * enrich text/background → combine sheets.
 * Pure; used by PhotoGrid and by the Jest example.
 */
export function buildBookLayout(
  assets: AssetResponseDto[],
  options: BookLayoutOptions,
): BookLayout {
  if (assets.length === 0) {
    return { pages: [], logicalPages: [], groups: [], styles: [], labels: [] };
  }

  const criteria = criteriaForMode(options.groupingMode, assets);
  const groups = groupAssets(assets, criteria);

  const styles: LayoutStyle[] = groups.map((group) =>
    options.layoutStyle === "auto"
      ? autoLayoutStyleFor(group)
      : options.layoutStyle,
  );

  const labels: (string | null)[] = options.showGroupLabels
    ? groups.map((group) => {
        // A manual per-group override wins over the generated caption.
        const override = options.labelOverrides?.[group.firstAssetId]?.trim();
        if (override) return override;
        return formatGroupLabel(
          {
            location: group.location,
            startDate: group.startDate,
            endDate: group.endDate,
            people: group.people,
          },
          options.labelLocale,
        );
      })
    : groups.map(() => null);

  // Groups are contiguous runs, so the first member's index is the boundary.
  const indexById = new Map(
    assets.map((asset, index) => [asset.id, index] as const),
  );
  const groupBoundaries = groups
    .slice(1)
    .map((group) => indexById.get(group.firstAssetId))
    .filter((index): index is number => index !== undefined && index > 0);

  // Lay out logical pages first; combining happens after enrichment so each
  // half keeps its own background and text.
  const logical = calculatePageLayout(assets, {
    ...options,
    combinePages: false,
    groupBoundaries,
    segmentStyles: styles,
    groupLabels: labels.map((label) => label ?? null),
  }).map((page) => enrichLogicalPage(page, options));

  const pages = options.combinePages
    ? combineLogicalPages(logical)
    : logical.map(
        (page): BookPage => ({
          pageNumber: page.pageNumber,
          photos: page.photos,
          width: page.width,
          height: page.height,
          ...(page.groupLabel !== undefined
            ? { groupLabel: page.groupLabel }
            : {}),
          backgrounds: [page.background],
          textBoxes: page.textBoxes,
          anchors: [page.anchorId],
        }),
      );

  return { pages, logicalPages: logical, groups, styles, labels };
}
