/**
 * Builds the pages of a photo book from an ordered asset stream:
 * grouping (TASKS.md goal 2), automatic layout styles (goal 1) and automatic
 * group captions (goal 3), then hands everything to the single layout engine
 * so the web preview and the PDF render the same book.
 */

import type { AssetResponseDto } from "@immich/sdk";
import {
  calculatePageLayout,
  type LayoutOptions,
  type LayoutStyle,
  type Page,
} from "./pageLayout";
import {
  autoLayoutStyleFor,
  groupAssets,
  pickAutoCriteria,
  type GroupCriterion,
  type PhotoGroup,
} from "./photoGrouping";
import { formatGroupLabel } from "./groupLabel";

/** How the album is split into groups; "auto" picks criteria from the data. */
export type GroupingMode = "auto" | "off" | "day" | "location" | "person";

/** "auto" applies a style per group based on its size. */
export type LayoutStyleChoice = "auto" | LayoutStyle;

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
}

export interface BookLayout {
  pages: Page[];
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

/**
 * Full book pipeline: group → choose styles → generate captions → paginate.
 * Pure; used by PhotoGrid and by the Jest example.
 */
export function buildBookLayout(
  assets: AssetResponseDto[],
  options: BookLayoutOptions,
): BookLayout {
  if (assets.length === 0) {
    return { pages: [], groups: [], styles: [], labels: [] };
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

  const pages = calculatePageLayout(assets, {
    ...options,
    groupBoundaries,
    segmentStyles: styles,
    groupLabels: labels.map((label) => label ?? null),
  });

  return { pages, groups, styles, labels };
}
