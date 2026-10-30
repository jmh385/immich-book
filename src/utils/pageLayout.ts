import { JustifiedLayout } from "@immich/justified-layout-wasm";
import type { AssetResponseDto } from "@immich/sdk";
import { presetSlots, type PageLayoutPreset } from "./layoutPresets";

export interface PageSize {
  width: number; // in pixels
  height: number; // in pixels
  name: "A4" | "LETTER" | "A3";
}

export interface PhotoBox {
  asset: AssetResponseDto;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PageAlignment = "left" | "center" | "right";

/**
 * Layout style of a page group (TASKS.md goal 1):
 * - justified: the usual rows (default)
 * - spotlight: one photo per page, filling the content area
 * - mixed: a large first photo plus justified rows below it
 */
export type LayoutStyle = "justified" | "spotlight" | "mixed";

export interface Page {
  pageNumber: number;
  photos: PhotoBox[];
  width: number;
  height: number;
  /** Automatic group caption shown on this page (left half in combined mode). */
  groupLabel?: string;
  /** Second group caption in combined-pages mode (right half). */
  groupLabelRight?: string;
}

// Convert millimeters to pixels (assuming 300 DPI)
// 1 inch = 25.4 mm = 300 pixels
// 1 mm = 300/25.4 = 11.811023622047244 pixels
export function mmToPixels(mm: number): number {
  return Math.round(mm * 11.811023622047244);
}

// Page sizes in pixels (at 300 DPI)
export const PAGE_SIZES: Record<string, Record<string, PageSize>> = {
  A4: {
    portrait: { width: mmToPixels(210), height: mmToPixels(297), name: "A4" }, // 210mm x 297mm
    landscape: { width: mmToPixels(297), height: mmToPixels(210), name: "A4" },
  },
  LETTER: {
    portrait: {
      width: mmToPixels(215.9),
      height: mmToPixels(279.4),
      name: "LETTER",
    }, // 8.5" x 11"
    landscape: {
      width: mmToPixels(279.4),
      height: mmToPixels(215.9),
      name: "LETTER",
    },
  },
  A3: {
    portrait: { width: mmToPixels(297), height: mmToPixels(420), name: "A3" }, // 297mm x 420mm
    landscape: { width: mmToPixels(420), height: mmToPixels(297), name: "A3" },
  },
};

export interface LayoutOptions {
  pageSize: "A4" | "LETTER" | "A3" | "CUSTOM";
  orientation: "portrait" | "landscape";
  margin: number; // in pixels
  rowHeight: number; // in pixels
  spacing: number; // in pixels
  customWidth?: number; // in pixels
  customHeight?: number; // in pixels
  combinePages?: boolean; // combine two pages into one PDF page
  customAspectRatios?: Map<string, number>; // custom aspect ratios per asset ID
  pageAlignments?: Map<number, PageAlignment>; // alignment per page number
  /**
   * Asset indices that start a new group: index 0 ends up implicitly at the
   * front, any other index forces a page break before that asset. Allows
   * multiple layout styles to coexist, because each group is laid out on its
   * own pages (automatic grouping, TASKS.md goal 2).
   */
  groupBoundaries?: number[];
  /** Layout style per group; parallel to groupBoundaries (plus implicit first). */
  segmentStyles?: LayoutStyle[];
  /** Caption per group; shown on the first page of each group. */
  groupLabels?: (string | null)[];
  /**
   * Per-page layout preset overrides, keyed by the page's first asset id
   * (TASKS.md goal 5). "auto" keeps the group's style.
   */
  pageLayouts?: Record<string, PageLayoutPreset>;
}

/**
 * Calculate page-based layout for photos
 * This is the single source of truth for layout - used by both web and PDF
 */
export function calculatePageLayout(
  assets: AssetResponseDto[],
  options: LayoutOptions,
): Page[] {
  if (assets.length === 0) return [];

  const {
    pageSize,
    orientation,
    margin,
    rowHeight,
    spacing,
    customWidth,
    customHeight,
    customAspectRatios,
    pageAlignments,
  } = options;

  // Determine page dimensions in pixels
  let pageDimensions: { width: number; height: number };
  if (pageSize === "CUSTOM" && customWidth && customHeight) {
    pageDimensions = {
      width: customWidth,
      height: customHeight,
    };
  } else if (pageSize !== "CUSTOM") {
    pageDimensions = PAGE_SIZES[pageSize][orientation];
  } else {
    // Fallback to A4 portrait if custom selected but no dimensions provided
    pageDimensions = PAGE_SIZES.A4.portrait;
  }

  const contentWidth = pageDimensions.width - margin * 2;
  const contentHeight = pageDimensions.height - margin * 2;

  // Determine page segments (groups). Starts are asset index 0 plus every
  // other declared boundary; each segment is laid out independently and can
  // have its own style and caption.
  const boundarySet = new Set<number>(
    (options.groupBoundaries ?? []).filter((i) => i > 0 && i < assets.length),
  );
  const starts = [0, ...[...boundarySet].sort((a, b) => a - b)];
  const segments: { start: number; end: number }[] = [];
  for (let i = 0; i < starts.length; i++) {
    segments.push({
      start: starts[i],
      end: i + 1 < starts.length ? starts[i + 1] : assets.length,
    });
  }

  // Aspect ratio of one asset, honoring custom ratios and EXIF orientation.
  const assetRatio = (asset: AssetResponseDto): number => {
    const customRatio = customAspectRatios?.get(asset.id);
    if (customRatio) {
      return customRatio;
    }
    const width = asset.exifInfo?.exifImageWidth || 1;
    const height = asset.exifInfo?.exifImageHeight || 1;
    if (asset.exifInfo?.orientation == "6") {
      return height / width;
    }
    return width / height;
  };

  // Segment-relative photo boxes: x within the content area, y relative to
  // the segment's first content row; page position is applied during paging.
  type Box = {
    asset: AssetResponseDto;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Rows for a run of assets via the justified layout algorithm.
  const justifiedRows = (run: AssetResponseDto[]): Box[] => {
    const runRatios = new Float32Array(run.map(assetRatio));
    const layout = new JustifiedLayout(runRatios, {
      rowHeight,
      rowWidth: contentWidth,
      spacing,
      heightTolerance: 0,
    });
    return run.map((asset, i) => {
      const position = layout.getPosition(i);
      return {
        asset,
        x: position.left,
        y: position.top,
        width: position.width,
        height: position.height,
      };
    });
  };

  // Boxes for one segment according to its style.
  const boxesForSegment = (
    segmentAssets: AssetResponseDto[],
    style: LayoutStyle,
  ): Box[] => {
    if (style === "spotlight") {
      // One photo per page, filling the content area.
      return segmentAssets.map((asset) => ({
        asset,
        x: 0,
        y: 0,
        width: contentWidth,
        height: contentHeight,
      }));
    }

    if (style === "mixed" && segmentAssets.length > 1) {
      // First photo spans the full content width, capped at half the page so
      // the remaining photos keep a visible area beneath it.
      const first = segmentAssets[0];
      const firstHeight = Math.min(
        contentHeight / 2,
        contentWidth / assetRatio(first),
      );
      const firstBox: Box = {
        asset: first,
        x: 0,
        y: 0,
        width: contentWidth,
        height: firstHeight,
      };
      const rest = justifiedRows(segmentAssets.slice(1)).map((box) => ({
        ...box,
        y: box.y + firstHeight + spacing,
      }));
      // If nothing else fits below the large photo (page too short), let the
      // rows overflow to following pages through normal pagination.
      return [firstBox, ...rest];
    }

    return justifiedRows(segmentAssets);
  };

  // Run the segment layouts and paginate their boxes into pages.
  const pages: Page[] = [];
  let currentPage: Page | null = null;

  const flushPage = () => {
    if (currentPage && currentPage.photos.length > 0) {
      pages.push(currentPage);
    }
    currentPage = null;
  };

  const startPage = (label?: string) => {
    flushPage();
    currentPage = {
      pageNumber: pages.length + 1,
      photos: [],
      width: pageDimensions.width,
      height: pageDimensions.height,
      ...(label !== undefined ? { groupLabel: label } : {}),
    };
  };

  const pageGuard = () => currentPage as Page;

  // Group boxes into rows (same y, small tolerance); rows stay in asset order.
  const groupRows = (boxes: Box[]): Box[][] => {
    const rows: Box[][] = [];
    for (const box of boxes) {
      const row = rows.find(
        (candidate) => Math.abs(candidate[0].y - box.y) <= 1,
      );
      if (row) {
        row.push(box);
      } else {
        rows.push([box]);
      }
    }
    return rows;
  };

  // Boxes that fit on one page: whole rows while the content area lasts.
  // Spotlight keeps exactly one photo per page.
  const boxesForPage = (
    boxes: Box[],
    style: LayoutStyle,
    contentHeightLimit: number,
  ): Box[] => {
    if (style === "spotlight") return boxes.slice(0, 1);

    const taken: Box[] = [];
    for (const row of groupRows(boxes)) {
      const rowBottom = Math.max(...row.map((box) => box.y + box.height));
      if (taken.length > 0 && rowBottom > contentHeightLimit) break;
      taken.push(...row);
    }
    return taken;
  };

  segments.forEach((segment, segmentIndex) => {
    const style: LayoutStyle =
      options.segmentStyles?.[segmentIndex] ?? "justified";
    const label = options.groupLabels?.[segmentIndex] ?? undefined;
    let remaining = assets.slice(segment.start, segment.end);
    let firstPageOfGroup = true;

    while (remaining.length > 0) {
      const anchorId = remaining[0].id;
      const preset = options.pageLayouts?.[anchorId];

      // A group always starts on a fresh page; its label only on page one.
      startPage(firstPageOfGroup ? label : undefined);
      firstPageOfGroup = false;

      if (preset && preset !== "auto") {
        // Preset page: consume as many photos as it has slots.
        const slots = presetSlots(
          preset,
          contentWidth,
          contentHeight,
          spacing,
        );
        const count = Math.min(slots.length, remaining.length);
        for (let i = 0; i < count; i++) {
          pageGuard().photos.push({
            asset: remaining[i],
            x: slots[i].x + margin,
            y: slots[i].y + margin,
            width: slots[i].width,
            height: slots[i].height,
          });
        }
        remaining = remaining.slice(count);
        continue;
      }

      const boxes = boxesForPage(
        boxesForSegment(remaining, style),
        style,
        contentHeight,
      );
      for (const box of boxes) {
        pageGuard().photos.push({
          asset: box.asset,
          x: box.x + margin,
          y: box.y + margin,
          width: box.width,
          height: box.height,
        });
      }
      // Always make progress, even for a single oversized photo.
      remaining = remaining.slice(Math.max(1, boxes.length));
    }
  });
  flushPage();

  // Apply page alignments per row (before combining pages)
  if (pageAlignments) {
    for (const page of pages) {
      const alignment = pageAlignments.get(page.pageNumber) || "left";

      if (page.photos.length > 0 && alignment !== "left") {
        // Group photos by row (photos with same Y position, allowing small tolerance)
        const rows: PhotoBox[][] = [];
        const tolerance = 1; // 1 pixel tolerance for grouping rows

        for (const photo of page.photos) {
          // Find existing row with matching Y position
          let foundRow = false;
          for (const row of rows) {
            if (Math.abs(row[0].y - photo.y) <= tolerance) {
              row.push(photo);
              foundRow = true;
              break;
            }
          }
          // Create new row if no matching row found
          if (!foundRow) {
            rows.push([photo]);
          }
        }

        // Apply alignment to each row independently
        for (const row of rows) {
          const minLeftEdge = Math.min(...row.map((photo) => photo.x));
          const maxRightEdge = Math.max(
            ...row.map((photo) => photo.x + photo.width)
          );

          let shift = 0;
          if (alignment === "right") {
            // Calculate shift needed to align right edge to content area
            const rightEdge = margin + contentWidth;
            shift = rightEdge - maxRightEdge;
          } else if (alignment === "center") {
            // Calculate shift needed to center the content
            const usedWidth = maxRightEdge - minLeftEdge;
            const availableSpace = contentWidth - usedWidth;
            const targetLeftEdge = margin + availableSpace / 2;
            shift = targetLeftEdge - minLeftEdge;
          }

          // Apply shift to all photos in this row
          for (const photo of row) {
            photo.x += shift;
          }
        }
      }
    }
  }

  // Combine pages if requested
  if (options.combinePages) {
    const combinedPages: Page[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      const leftPage = pages[i];
      const rightPage = pages[i + 1];

      if (rightPage) {
        // Combine two pages side-by-side
        const combinedPage: Page = {
          pageNumber: Math.floor(i / 2) + 1,
          photos: [
            // Left page photos - keep as is
            ...leftPage.photos,
            // Right page photos - shift horizontally by page width
            ...rightPage.photos.map((photo) => ({
              ...photo,
              x: photo.x + pageDimensions.width,
            })),
          ],
          width: pageDimensions.width * 2,
          height: pageDimensions.height,
        };
        // Labels of the two logical pages move with their halves.
        if (leftPage.groupLabel !== undefined) {
          combinedPage.groupLabel = leftPage.groupLabel;
        }
        if (rightPage.groupLabel !== undefined) {
          combinedPage.groupLabelRight = rightPage.groupLabel;
        }
        combinedPages.push(combinedPage);
      } else {
        // Odd number of pages - last page stays single
        const singlePage: Page = {
          ...leftPage,
          pageNumber: Math.floor(i / 2) + 1,
          width: pageDimensions.width * 2, // Keep same width for consistency
        };
        combinedPages.push(singlePage);
      }
    }
    return combinedPages;
  }

  return pages;
}
