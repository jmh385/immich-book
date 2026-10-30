import { useState, useEffect, useMemo } from "react";
import {
  searchAssets,
  type AlbumResponseDto,
  type AssetResponseDto,
} from "@immich/sdk";
import {
  PDFViewer,
  Document,
  Page,
  Image,
  View,
  Text,
  StyleSheet,
  Font,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from "@react-pdf/renderer";
import {
  PAGE_SIZES,
  type PageAlignment,
} from "../utils/pageLayout";
import {
  buildBookLayout,
  type GroupingMode,
  type LayoutStyleChoice,
} from "../utils/book";
import {
  LAYOUT_PRESETS,
  type PageLayoutPreset,
} from "../utils/layoutPresets";
import {
  DEFAULT_BACKGROUND,
  GRADIENT_PRESETS,
  backgroundCss,
  pdfGradient,
  type BackgroundSpec,
  type GradientPresetId,
} from "../utils/backgrounds";
import {
  TEXT_FONT_FAMILIES,
  fontCss,
  type TextBox,
  type TextBoxOverride,
} from "../utils/textBoxes";
import type { ImmichConfig } from "./ConnectionForm";
import roboto400 from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";
import roboto500 from "@fontsource/roboto/files/roboto-latin-500-normal.woff?url";
import Icon from "@mdi/react";
import {
  mdiFormatAlignLeft,
  mdiFormatAlignCenter,
  mdiFormatAlignRight,
} from "@mdi/js";

// Register Roboto font for PDF using local bundled files
Font.register({
  family: "Roboto",
  fonts: [
    { src: roboto400, fontWeight: 400 },
    { src: roboto500, fontWeight: 500 },
  ],
});

interface PhotoGridProps {
  immichConfig: ImmichConfig;
  album: AlbumResponseDto;
  onBack: () => void;
}

type Position = "bottom" | "top" | "left" | "right";

interface GlobalConfig {
  // Page settings
  pageSize: "A4" | "LETTER" | "A3" | "CUSTOM";
  orientation: "portrait" | "landscape";
  pageWidth: number;
  pageHeight: number;
  margin: number;
  combinePages: boolean;

  // Layout settings
  rowHeight: number;
  spacing: number;
  filterVideos: boolean;

  // Display settings
  showDates: boolean;
  showDescriptions: boolean;
  fontSize: number;

  // Automatic grouping and layout (TASKS.md goals 1-3)
  groupingMode: GroupingMode;
  layoutStyle: LayoutStyleChoice;
  showGroupLabels: boolean;

  // Page backgrounds (TASKS.md goal 7)
  defaultBackground: BackgroundSpec;
}

interface AlbumConfig extends GlobalConfig {
  // Customizations (album-specific only)
  customAspectRatios: Record<string, number>;
  customOrdering: string[] | null;
  descriptionPositions: Record<string, Position>;
  pageAlignments: Record<number, PageAlignment>;
  /** Manual caption overrides keyed by the group's first asset id. */
  groupLabelOverrides: Record<string, string>;
  /** Per-page layout presets keyed by the page's first asset id. */
  pageLayouts: Record<string, PageLayoutPreset>;
  /** Per-text-box overrides keyed by `kind:assetId`. */
  textBoxOverrides: Record<string, TextBoxOverride>;
  /** Per-page background overrides keyed by the page's first asset id. */
  pageBackgrounds: Record<string, BackgroundSpec>;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  pageSize: "CUSTOM",
  orientation: "portrait",
  pageWidth: 2515,
  pageHeight: 3260,
  margin: 118,
  combinePages: true,
  rowHeight: 994,
  spacing: 20,
  filterVideos: true,
  showDates: true,
  showDescriptions: true,
  fontSize: 12,
  groupingMode: "auto",
  layoutStyle: "auto",
  showGroupLabels: true,
  defaultBackground: DEFAULT_BACKGROUND,
};

// Helper functions for config persistence
function loadGlobalConfig(): GlobalConfig {
  try {
    const stored = localStorage.getItem("immich-book-global-config");
    if (stored) {
      return { ...DEFAULT_GLOBAL_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load global config:", e);
  }
  return DEFAULT_GLOBAL_CONFIG;
}

function saveGlobalConfig(config: GlobalConfig) {
  try {
    localStorage.setItem("immich-book-global-config", JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save global config:", e);
  }
}

function loadAlbumConfig(albumId: string): AlbumConfig {
  const globalConfig = loadGlobalConfig();

  try {
    const stored = localStorage.getItem(`immich-book-config-${albumId}`);
    if (stored) {
      const albumSpecific = JSON.parse(stored);
      return {
        ...globalConfig,
        customAspectRatios: {},
        customOrdering: null,
        descriptionPositions: {},
        pageAlignments: {},
        groupLabelOverrides: {},
        pageLayouts: {},
        textBoxOverrides: {},
        pageBackgrounds: {},
        ...albumSpecific,
      };
    }
  } catch (e) {
    console.error("Failed to load album config:", e);
  }

  return {
    ...globalConfig,
    customAspectRatios: {},
    customOrdering: null,
    descriptionPositions: {},
    pageAlignments: {},
    groupLabelOverrides: {},
    pageLayouts: {},
    textBoxOverrides: {},
    pageBackgrounds: {},
  };
}

function saveAlbumConfig(albumId: string, config: AlbumConfig) {
  try {
    localStorage.setItem(
      `immich-book-config-${albumId}`,
      JSON.stringify(config),
    );

    // Also update global config with page and layout settings
    const globalConfig: GlobalConfig = {
      pageSize: config.pageSize,
      orientation: config.orientation,
      pageWidth: config.pageWidth,
      pageHeight: config.pageHeight,
      margin: config.margin,
      combinePages: config.combinePages,
      rowHeight: config.rowHeight,
      spacing: config.spacing,
      filterVideos: config.filterVideos,
      showDates: config.showDates,
      showDescriptions: config.showDescriptions,
      fontSize: config.fontSize,
      groupingMode: config.groupingMode,
      layoutStyle: config.layoutStyle,
      showGroupLabels: config.showGroupLabels,
      defaultBackground: config.defaultBackground,
    };
    saveGlobalConfig(globalConfig);
  } catch (e) {
    console.error("Failed to save album config:", e);
  }
}

// Convert 300 DPI pixels to 72 DPI points for PDF
// At 300 DPI: 1 inch = 300 pixels
// At 72 DPI: 1 inch = 72 points
// Conversion: points = pixels * (72/300)
const toPoints = (pixels: number) => pixels * (72 / 300);

// Map a CSS-style gradient angle to SVG linear-gradient coordinates.
function gradientCoordinates(angle: number): {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
} {
  switch (angle) {
    case 0:
      return { x1: "0%", y1: "100%", x2: "0%", y2: "0%" };
    case 45:
      return { x1: "0%", y1: "100%", x2: "100%", y2: "0%" };
    case 90:
      return { x1: "0%", y1: "0%", x2: "100%", y2: "0%" };
    case 135:
      return { x1: "0%", y1: "0%", x2: "100%", y2: "100%" };
    case 180:
      return { x1: "0%", y1: "0%", x2: "0%", y2: "100%" };
    default:
      return { x1: "0%", y1: "0%", x2: "100%", y2: "100%" };
  }
}

// Static styles for the PDF
const staticStyles = StyleSheet.create({
  page: {
    backgroundColor: "white",
  },
  photoContainer: {
    position: "absolute",
  },
  photo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
});

// Dynamic styles based on font size
// The album endpoint no longer returns its assets, so album contents are read
// through the search API, which pages at this many assets per request.
const ALBUM_SEARCH_PAGE_SIZE = 1000;

/** All assets of an album, with the EXIF data the layout is based on. */
async function fetchAlbumAssets(albumId: string): Promise<AssetResponseDto[]> {
  // Keyed by id, because paging over a large album can repeat an asset.
  const assets = new Map<string, AssetResponseDto>();
  let page: number | undefined = 1;

  while (page !== undefined) {
    const { assets: result } = await searchAssets({
      metadataSearchDto: {
        albumIds: [albumId],
        withExif: true,
        withPeople: true,
        size: ALBUM_SEARCH_PAGE_SIZE,
        page,
      },
    });

    for (const asset of result.items) {
      assets.set(asset.id, asset);
    }

    page = result.nextPage ? Number(result.nextPage) : undefined;
  }

  return [...assets.values()];
}

function PhotoGrid({ immichConfig, album, onBack }: PhotoGridProps) {
  const [assets, setAssets] = useState<AssetResponseDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "pdf">("preview");

  // Load config on mount
  const initialConfig = useMemo(() => loadAlbumConfig(album.id), [album.id]);

  // Page settings
  const [pageSize, _setPageSize] = useState<"A4" | "LETTER" | "A3" | "CUSTOM">(
    initialConfig.pageSize,
  );
  const [orientation, _setOrientation] = useState<"portrait" | "landscape">(
    initialConfig.orientation,
  );
  const [pageWidth, setPageWidth] = useState(initialConfig.pageWidth);
  const [pageHeight, setPageHeight] = useState(initialConfig.pageHeight);
  const [margin, setMargin] = useState(initialConfig.margin);
  const [combinePages, setCombinePages] = useState(initialConfig.combinePages);

  // Layout settings
  const [rowHeight, setRowHeight] = useState(initialConfig.rowHeight);
  const [spacing, setSpacing] = useState(initialConfig.spacing);
  const [filterVideos, setFilterVideos] = useState(initialConfig.filterVideos);

  // Validation helpers
  const isPageWidthValid = pageWidth >= 1000 && pageWidth <= 10000;
  const isPageHeightValid = pageHeight >= 1000 && pageHeight <= 10000;
  const isMarginValid = margin >= 0 && margin <= pageWidth / 2;
  const isRowHeightValid = rowHeight >= 300 && rowHeight <= pageHeight;
  const isSpacingValid = spacing >= 0 && spacing <= 100;

  // Clamped values for use in layout calculations (prevent crashes from invalid values)
  const validPageWidth = isPageWidthValid
    ? pageWidth
    : Math.max(1000, Math.min(10000, pageWidth));
  const validPageHeight = isPageHeightValid
    ? pageHeight
    : Math.max(1000, Math.min(10000, pageHeight));
  const validMargin = isMarginValid
    ? margin
    : Math.max(0, Math.min(validPageWidth / 2, margin));
  const validRowHeight = isRowHeightValid
    ? rowHeight
    : Math.max(300, Math.min(validPageHeight, rowHeight));
  const validSpacing = isSpacingValid
    ? spacing
    : Math.max(0, Math.min(100, spacing));

  // Display settings
  const [showDates, setShowDates] = useState(initialConfig.showDates);
  const [showDescriptions, setShowDescriptions] = useState(
    initialConfig.showDescriptions,
  );
  const [fontSize, setFontSize] = useState(initialConfig.fontSize);

  // Automatic grouping and layout (TASKS.md goals 1-3)
  const [groupingMode, setGroupingMode] = useState<GroupingMode>(
    initialConfig.groupingMode,
  );
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyleChoice>(
    initialConfig.layoutStyle,
  );
  const [showGroupLabels, setShowGroupLabels] = useState(
    initialConfig.showGroupLabels,
  );

  // Create dynamic styles based on current fontSize
  // Customizations
  const [customAspectRatios, setCustomAspectRatios] = useState<
    Map<string, number>
  >(() => new Map(Object.entries(initialConfig.customAspectRatios)));
  const [customOrdering, setCustomOrdering] = useState<string[] | null>(
    initialConfig.customOrdering,
  );
  const [descriptionPositions, setDescriptionPositions] = useState<
    Map<string, Position>
  >(() => new Map(Object.entries(initialConfig.descriptionPositions)));
  const [pageAlignments, setPageAlignments] = useState<
    Map<number, PageAlignment>
  >(
    () =>
      new Map(
        Object.entries(initialConfig.pageAlignments).map(([k, v]) => [
          Number(k),
          v,
        ]),
      ),
  );
  // Manual caption overrides per group (keyed by the group's first asset id).
  const [groupLabelOverrides, setGroupLabelOverrides] = useState<
    Map<string, string>
  >(() => new Map(Object.entries(initialConfig.groupLabelOverrides)));

  // Page presets, text boxes and backgrounds (TASKS.md goals 4-7)
  const [pageLayouts, setPageLayouts] = useState<
    Map<string, PageLayoutPreset>
  >(() => new Map(Object.entries(initialConfig.pageLayouts)));
  const [textBoxOverrides, setTextBoxOverrides] = useState<
    Map<string, TextBoxOverride>
  >(() => new Map(Object.entries(initialConfig.textBoxOverrides)));
  const [pageBackgrounds, setPageBackgrounds] = useState<
    Map<string, BackgroundSpec>
  >(() => new Map(Object.entries(initialConfig.pageBackgrounds)));
  const [defaultBackground, setDefaultBackground] = useState<BackgroundSpec>(
    initialConfig.defaultBackground,
  );
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(
    null,
  );
  const [textDragState, setTextDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);

  // Drag state for reordering
  const [reorderDragState, setReorderDragState] = useState<{
    draggedAssetId: string;
    draggedIndex: number;
  } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Drag state for aspect ratio adjustment
  const [aspectDragState, setAspectDragState] = useState<{
    assetId: string;
    edge: "left" | "right";
    startX: number;
    originalAspectRatio: number;
    originalX: number;
    originalWidth: number;
  } | null>(null);

  // Update page dimensions when size or orientation changes
  useEffect(() => {
    if (pageSize !== "CUSTOM") {
      const dimensions = PAGE_SIZES[pageSize][orientation];
      setPageWidth(dimensions.width);
      setPageHeight(dimensions.height);
    }
  }, [pageSize, orientation]);

  useEffect(() => {
    loadAlbumAssets();

    // Clean up old localStorage keys (migration)
    localStorage.removeItem(`immich-book-aspect-ratios-${album.id}`);
    localStorage.removeItem(`immich-book-ordering-${album.id}`);
    localStorage.removeItem(`immich-book-description-positions-${album.id}`);
  }, [album.id]);

  // Save config to localStorage whenever it changes (with clamped values)
  useEffect(() => {
    // Only save if all values are valid
    if (
      !isPageWidthValid ||
      !isPageHeightValid ||
      !isMarginValid ||
      !isRowHeightValid ||
      !isSpacingValid
    ) {
      return;
    }

    const config: AlbumConfig = {
      pageSize,
      orientation,
      pageWidth,
      pageHeight,
      margin,
      combinePages,
      rowHeight,
      spacing,
      filterVideos,
      showDates,
      showDescriptions,
      fontSize,
      groupingMode,
      layoutStyle,
      showGroupLabels,
      customAspectRatios: Object.fromEntries(customAspectRatios),
      customOrdering,
      descriptionPositions: Object.fromEntries(descriptionPositions),
      pageAlignments: Object.fromEntries(pageAlignments),
      groupLabelOverrides: Object.fromEntries(groupLabelOverrides),
      pageLayouts: Object.fromEntries(pageLayouts),
      textBoxOverrides: Object.fromEntries(textBoxOverrides),
      pageBackgrounds: Object.fromEntries(pageBackgrounds),
      defaultBackground,
    };
    saveAlbumConfig(album.id, config);
  }, [
    album.id,
    pageSize,
    orientation,
    pageWidth,
    pageHeight,
    margin,
    combinePages,
    rowHeight,
    spacing,
    filterVideos,
    showDates,
    showDescriptions,
    fontSize,
    groupingMode,
    layoutStyle,
    showGroupLabels,
    defaultBackground,
    customAspectRatios,
    customOrdering,
    descriptionPositions,
    pageAlignments,
    groupLabelOverrides,
    pageLayouts,
    textBoxOverrides,
    pageBackgrounds,
    isPageWidthValid,
    isPageHeightValid,
    isMarginValid,
    isRowHeightValid,
    isSpacingValid,
  ]);

  const loadAlbumAssets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const albumAssets = await fetchAlbumAssets(album.id);
      // Sort assets by creation date ascending
      const sorted = albumAssets.sort((a, b) => {
        return (
          new Date(a.fileCreatedAt).getTime() -
          new Date(b.fileCreatedAt).getTime()
        );
      });
      setAssets(sorted);
    } catch (err) {
      setError((err as Error).message || "Failed to load album assets");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle aspect ratio drag start
  const handleAspectDragStart = (
    assetId: string,
    edge: "left" | "right",
    aspectRatio: number,
    x: number,
    width: number,
    event: React.MouseEvent,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setAspectDragState({
      assetId,
      edge,
      startX: event.clientX,
      originalAspectRatio: aspectRatio,
      originalX: x,
      originalWidth: width,
    });
  };

  // Reset all aspect ratio customizations
  const handleResetAllCustomizations = () => {
    setCustomAspectRatios(new Map());
  };

  // Drag & drop handlers for reordering
  const handleReorderDragStart = (
    assetId: string,
    index: number,
    event: React.DragEvent,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    setReorderDragState({ draggedAssetId: assetId, draggedIndex: index });
  };

  const handleReorderDragOver = (index: number, event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetIndex(index);
  };

  const handleReorderDragEnd = () => {
    setReorderDragState(null);
    setDropTargetIndex(null);
  };

  const handleReorderDrop = (targetIndex: number, event: React.DragEvent) => {
    event.preventDefault();

    if (!reorderDragState) return;

    const { draggedIndex } = reorderDragState;

    if (draggedIndex === targetIndex) {
      handleReorderDragEnd();
      return;
    }

    // Create new ordering based on current filtered assets
    const currentOrder = filteredAssets.map((asset) => asset.id);
    const newOrder = [...currentOrder];

    // Remove from old position
    const [removed] = newOrder.splice(draggedIndex, 1);
    // Insert at new position
    newOrder.splice(targetIndex, 0, removed);

    setCustomOrdering(newOrder);
    handleReorderDragEnd();
  };

  // Reset ordering to default
  const handleResetOrdering = () => {
    setCustomOrdering(null);
  };

  // Reset all description position customizations
  const handleResetDescriptionPositions = () => {
    setDescriptionPositions(new Map());
  };

  // Filter assets based on user preferences (default order)
  const defaultFilteredAssets = useMemo(() => {
    return filterVideos
      ? assets.filter((asset) => asset.type === "IMAGE")
      : assets;
  }, [assets, filterVideos]);

  // Apply custom ordering to filtered assets
  const filteredAssets = useMemo(() => {
    if (!customOrdering) return defaultFilteredAssets;

    // Create a map for quick lookup
    const assetMap = new Map(
      defaultFilteredAssets.map((asset) => [asset.id, asset]),
    );
    // Reorder based on customOrdering, filtering out any IDs that don't exist
    const reordered = customOrdering
      .map((id) => assetMap.get(id))
      .filter((asset): asset is AssetResponseDto => asset !== undefined);

    // Add any assets that aren't in customOrdering at the end
    const orderedIds = new Set(customOrdering);
    const remaining = defaultFilteredAssets.filter(
      (asset) => !orderedIds.has(asset.id),
    );

    return [...reordered, ...remaining];
  }, [defaultFilteredAssets, customOrdering]);

  // Calculate content width for snapping
  const contentWidth = useMemo(() => {
    return validPageWidth - validMargin * 2;
  }, [validPageWidth, validMargin]);

  // Calculate unified page layout - single source of truth!
  // Automatic grouping, layout styles and group captions are resolved here,
  // so the web preview and the PDF render exactly the same book.
  const book = useMemo(() => {
    // Adjust aspect ratios for assets with left/right description positions
    const adjustedAspectRatios = new Map(customAspectRatios);

    filteredAssets.forEach((asset) => {
      const descPosition = descriptionPositions.get(asset.id) || "bottom";
      const hasDescription = showDescriptions && !!asset.exifInfo?.description;

      if (
        hasDescription &&
        (descPosition === "left" || descPosition === "right")
      ) {
        // Double the aspect ratio (make it wider) to account for description space
        const currentRatio = customAspectRatios.get(asset.id);

        if (currentRatio) {
          adjustedAspectRatios.set(asset.id, currentRatio * 2);
        } else {
          // Calculate natural aspect ratio and double it
          const width = asset.exifInfo?.exifImageWidth || 1;
          const height = asset.exifInfo?.exifImageHeight || 1;
          let naturalRatio = width / height;
          if (asset.exifInfo?.orientation === "6") {
            naturalRatio = height / width;
          }
          adjustedAspectRatios.set(asset.id, naturalRatio * 2);
        }
      }
    });

    return buildBookLayout(filteredAssets, {
      pageSize: "CUSTOM",
      orientation: "portrait",
      margin: validMargin,
      rowHeight: validRowHeight,
      spacing: validSpacing,
      customWidth: validPageWidth,
      customHeight: validPageHeight,
      combinePages,
      customAspectRatios: adjustedAspectRatios,
      pageAlignments,
      groupingMode,
      layoutStyle,
      showGroupLabels,
      labelOverrides: Object.fromEntries(groupLabelOverrides),
      showDates,
      showDescriptions,
      fontSize,
      descriptionPosition: (assetId) =>
        descriptionPositions.get(assetId) || "bottom",
      textBoxOverrides: Object.fromEntries(textBoxOverrides),
      pageLayouts: Object.fromEntries(pageLayouts),
      defaultBackground,
      pageBackgrounds: Object.fromEntries(pageBackgrounds),
    });
  }, [
    filteredAssets,
    validMargin,
    validRowHeight,
    validSpacing,
    validPageWidth,
    validPageHeight,
    combinePages,
    customAspectRatios,
    descriptionPositions,
    showDates,
    showDescriptions,
    fontSize,
    pageAlignments,
    groupingMode,
    layoutStyle,
    showGroupLabels,
    groupLabelOverrides,
    textBoxOverrides,
    pageLayouts,
    defaultBackground,
    pageBackgrounds,
  ]);

  const pages = book.pages;

  const thumbnailUrl = (assetId: string) =>
    `${immichConfig.baseUrl}/assets/${assetId}/thumbnail?size=preview&apiKey=${immichConfig.apiKey}`;

  /** Shared background editor used for the album default and each page. */
  const renderBackgroundEditor = (
    spec: BackgroundSpec,
    onChange: (spec: BackgroundSpec) => void,
  ) => (
    <div className="flex flex-wrap items-center gap-1">
      <select
        value={spec.type}
        onChange={(event) => {
          const type = event.target.value as "color" | "gradient" | "photo";
          if (type === "color") {
            onChange({ type: "color", color: "#ffffff" });
          } else if (type === "gradient") {
            onChange({ type: "gradient", preset: "light" });
          } else {
            onChange({
              type: "photo",
              assetId: filteredAssets[0]?.id ?? "",
              dim: 0.2,
            });
          }
        }}
        className="px-1 py-0.5 text-xs border border-gray-300 rounded"
        title="Background type"
      >
        <option value="color">Colour</option>
        <option value="gradient">Gradient</option>
        <option value="photo">Photo</option>
      </select>
      {spec.type === "color" && (
        <input
          type="color"
          value={spec.color}
          onChange={(event) => onChange({ type: "color", color: event.target.value })}
          className="h-6 w-8 border border-gray-300 rounded"
          title="Background colour"
        />
      )}
      {spec.type === "gradient" && (
        <select
          value={spec.preset}
          onChange={(event) =>
            onChange({
              type: "gradient",
              preset: event.target.value as GradientPresetId,
            })
          }
          className="px-1 py-0.5 text-xs border border-gray-300 rounded"
          title="Gradient preset"
        >
          {GRADIENT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      )}
      {spec.type === "photo" && (
        <>
          <select
            value={spec.assetId}
            onChange={(event) =>
              onChange({ ...spec, assetId: event.target.value })
            }
            className="px-1 py-0.5 text-xs border border-gray-300 rounded max-w-40"
            title="Background photo"
          >
            <option value="">Choose photo…</option>
            {filteredAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.originalFileName}
              </option>
            ))}
          </select>
          <label className="text-xs text-gray-600">Dim</label>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.05"
            value={spec.dim}
            onChange={(event) =>
              onChange({ ...spec, dim: Number(event.target.value) })
            }
            className="w-16"
            title="Darken the background photo"
          />
        </>
      )}
    </div>
  );

  // Handle aspect ratio drag
  useEffect(() => {
    if (!aspectDragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - aspectDragState.startX;
      // Convert from 72 DPI screen to 300 DPI layout
      const deltaPixels = deltaX * (300 / 72);

      // Calculate new width based on edge being dragged
      const widthDelta =
        aspectDragState.edge === "right" ? deltaPixels : -deltaPixels;
      let newWidth = Math.max(50, aspectDragState.originalWidth + widthDelta);

      // Snap to full width when within threshold
      // Determine which page the image is on and snap to that page's right edge
      const snapThreshold = 50;
      const singlePageWidth = contentWidth + validMargin;

      // Calculate which page we're on (0-indexed)
      const pageIndex = Math.floor(
        aspectDragState.originalX / (singlePageWidth + validMargin),
      );

      // Calculate this page's start X position
      const pageStartX =
        pageIndex * (singlePageWidth + validMargin) + validMargin;

      // Calculate right edge relative to this page's start
      const rightEdge = aspectDragState.originalX - pageStartX + newWidth;

      if (Math.abs(rightEdge - contentWidth) <= snapThreshold) {
        newWidth = pageStartX + contentWidth - aspectDragState.originalX;
      }

      // Calculate new aspect ratio (width stays same height, so aspect ratio changes)
      const heightFromOriginal =
        aspectDragState.originalWidth / aspectDragState.originalAspectRatio;
      const newAspectRatio = newWidth / heightFromOriginal;

      setCustomAspectRatios((prev) => {
        const next = new Map(prev);
        next.set(aspectDragState.assetId, newAspectRatio);
        return next;
      });
    };

    const handleMouseUp = () => {
      setAspectDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [aspectDragState, contentWidth, margin]);

  // Selected text box across all sheets (combined right halves included).
  const selectedTextBox = useMemo(
    () =>
      selectedTextBoxId
        ? (pages.flatMap((page) => page.textBoxes).find(
            (box) => box.id === selectedTextBoxId,
          ) ?? null)
        : null,
    [pages, selectedTextBoxId],
  );

  const updateTextBoxOverride = (
    id: string,
    patch: Partial<TextBoxOverride>,
  ) => {
    setTextBoxOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, { ...prev.get(id), ...patch });
      return next;
    });
  };

  const resetTextBoxOverride = (id: string) => {
    setTextBoxOverrides((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  // Drag a text box: screen (72 DPI) delta → page pixels (300 DPI).
  useEffect(() => {
    if (!textDragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const scale = 300 / 72;
      const x =
        textDragState.originalX + (event.clientX - textDragState.startX) * scale;
      const y =
        textDragState.originalY + (event.clientY - textDragState.startY) * scale;
      updateTextBoxOverride(textDragState.id, {
        x: Math.round(x),
        y: Math.round(y),
      });
    };
    const handleMouseUp = () => setTextDragState(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [textDragState]);

  // Determine pageLayout based on combinePages setting
  const pageLayout = combinePages ? "singlePage" : "twoPageLeft";

  // Calculate total logical pages for display purposes
  const totalLogicalPages = combinePages ? pages.length * 2 : pages.length;

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-4 text-gray-600">Loading photos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto">
        <button
          onClick={onBack}
          className="mb-4 text-blue-600 hover:text-blue-800"
        >
          ← Back to albums
        </button>
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={loadAlbumAssets}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm transition-colors shadow-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 flex flex-col lg:flex-row flex-1 items-start lg:justify-between gap-4 lg:gap-8">
        <div className="w-full lg:w-auto">
          <button
            onClick={onBack}
            className="text-blue-600 hover:text-blue-800 mb-2"
          >
            ← Back to albums
          </button>
          <h2 className="text-2xl font-semibold">{album.albumName}</h2>
          <p className="text-gray-600 mt-1">
            {filteredAssets.length}{" "}
            {filteredAssets.length !== assets.length && `of ${assets.length}`}{" "}
            assets
          </p>
          {groupingMode !== "off" && book.groups.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {book.groups.length}{" "}
              {book.groups.length === 1 ? "group" : "groups"} ·{" "}
              {(["spotlight", "mixed", "justified"] as const)
                .map((style) => {
                  const count = book.styles.filter((s) => s === style).length;
                  return count > 0 ? `${count} ${style}` : null;
                })
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {groupingMode !== "off" &&
            showGroupLabels &&
            book.groups.length > 0 && (
              <details className="mt-2 text-xs text-gray-600">
                <summary className="cursor-pointer select-none text-gray-500">
                  Edit group captions
                </summary>
                <div className="mt-1 space-y-1">
                  {book.groups.map((group, index) => (
                    <input
                      key={group.id}
                      type="text"
                      value={groupLabelOverrides.get(group.firstAssetId) ?? ""}
                      placeholder={book.labels[index] ?? ""}
                      onChange={(e) => {
                        const next = new Map(groupLabelOverrides);
                        if (e.target.value.trim()) {
                          next.set(group.firstAssetId, e.target.value);
                        } else {
                          next.delete(group.firstAssetId);
                        }
                        setGroupLabelOverrides(next);
                      }}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded"
                      title="Leave empty to use the generated caption"
                    />
                  ))}
                </div>
              </details>
            )}

          {/* Generate PDF / Back to Edit button */}
          <div className="mt-4">
            {mode === "preview" ? (
              <button
                onClick={() => setMode("pdf")}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
              >
                Generate PDF
              </button>
            ) : (
              <button
                onClick={() => setMode("preview")}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors shadow-sm"
              >
                Back to Edit
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 w-full lg:w-auto">
          {/* 1. Page Setup */}
          <div className="p-2 bg-gray-50 rounded border border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                Page
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-1">
                <div className="flex items-center gap-1">
                  <label htmlFor="pageWidth" className="text-gray-600 text-xs">
                    Width:
                  </label>
                  <input
                    type="number"
                    id="pageWidth"
                    value={pageWidth}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setPageWidth(value);
                      }
                    }}
                    min="1000"
                    max="10000"
                    className={`px-1 py-0.5 w-16 text-xs border rounded ${
                      isPageWidthValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">px</span>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="pageHeight" className="text-gray-600 text-xs">
                    Height:
                  </label>
                  <input
                    type="number"
                    id="pageHeight"
                    value={pageHeight}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setPageHeight(value);
                      }
                    }}
                    min="1000"
                    max="10000"
                    className={`px-1 py-0.5 w-16 text-xs border rounded ${
                      isPageHeightValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">px</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="combinePages"
                    checked={combinePages}
                    onChange={(e) => setCombinePages(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="combinePages"
                    className="text-xs text-gray-700"
                  >
                    Combine Pages
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Layout */}
          <div className="p-2 bg-gray-50 rounded border border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                Layout
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-1">
                <div className="flex items-center gap-1">
                  <label htmlFor="margin" className="text-gray-600 text-xs">
                    Margin:
                  </label>
                  <input
                    type="number"
                    id="margin"
                    value={margin}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setMargin(value);
                      }
                    }}
                    min="0"
                    max={pageWidth / 2}
                    step="10"
                    className={`px-1 py-0.5 w-14 text-xs border rounded ${
                      isMarginValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">px</span>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="rowHeight" className="text-gray-600 text-xs">
                    Row Height:
                  </label>
                  <input
                    type="number"
                    id="rowHeight"
                    value={rowHeight}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setRowHeight(value);
                      }
                    }}
                    min="300"
                    max={pageHeight}
                    step="10"
                    className={`px-1 py-0.5 w-14 text-xs border rounded ${
                      isRowHeightValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">px</span>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="spacing" className="text-gray-600 text-xs">
                    Spacing:
                  </label>
                  <input
                    type="number"
                    id="spacing"
                    value={spacing}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!isNaN(value)) {
                        setSpacing(value);
                      }
                    }}
                    min="0"
                    max="100"
                    className={`px-1 py-0.5 w-12 text-xs border rounded ${
                      isSpacingValid
                        ? "border-gray-300"
                        : "border-red-500 bg-red-50"
                    }`}
                  />
                  <span className="text-xs text-gray-500">px</span>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="layoutStyle" className="text-gray-600 text-xs">
                    Style:
                  </label>
                  <select
                    id="layoutStyle"
                    value={layoutStyle}
                    onChange={(e) =>
                      setLayoutStyle(e.target.value as LayoutStyleChoice)
                    }
                    className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                    title="Page style per group; auto picks one from the group size"
                  >
                    <option value="auto">Auto</option>
                    <option value="justified">Justified rows</option>
                    <option value="mixed">Large photo + rows</option>
                    <option value="spotlight">One per page</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Presentation */}
          <div className="p-2 bg-gray-50 rounded border border-gray-300">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                Presentation
              </h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="filterVideos"
                    checked={filterVideos}
                    onChange={(e) => setFilterVideos(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="filterVideos"
                    className="text-xs text-gray-700"
                  >
                    Exclude Videos
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="showDates"
                    checked={showDates}
                    onChange={(e) => setShowDates(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label htmlFor="showDates" className="text-xs text-gray-700">
                    Show Dates
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="showDescriptions"
                    checked={showDescriptions}
                    onChange={(e) => setShowDescriptions(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="showDescriptions"
                    className="text-xs text-gray-700"
                  >
                    Show Descriptions
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="fontSize" className="text-gray-600 text-xs">
                    Font Size:
                  </label>
                  <select
                    id="fontSize"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                  >
                    <option value="8">8 pt</option>
                    <option value="9">9 pt</option>
                    <option value="10">10 pt</option>
                    <option value="11">11 pt</option>
                    <option value="12">12 pt</option>
                    <option value="14">14 pt</option>
                    <option value="16">16 pt</option>
                    <option value="18">18 pt</option>
                    <option value="20">20 pt</option>
                    <option value="22">22 pt</option>
                    <option value="24">24 pt</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <label htmlFor="groupingMode" className="text-gray-600 text-xs">
                    Grouping:
                  </label>
                  <select
                    id="groupingMode"
                    value={groupingMode}
                    onChange={(e) =>
                      setGroupingMode(e.target.value as GroupingMode)
                    }
                    className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                    title="Split the album into pages by day, location or people"
                  >
                    <option value="auto">Auto</option>
                    <option value="off">Off</option>
                    <option value="day">By day</option>
                    <option value="location">By location</option>
                    <option value="person">By person</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    id="showGroupLabels"
                    checked={showGroupLabels}
                    onChange={(e) => setShowGroupLabels(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <label
                    htmlFor="showGroupLabels"
                    className="text-xs text-gray-700"
                  >
                    Group Captions
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Page layouts, backgrounds and text boxes (goals 4-7) */}
          <details className="p-2 bg-gray-50 rounded border border-gray-300">
            <summary className="text-xs font-semibold text-gray-700 cursor-pointer select-none">
              Page layouts &amp; backgrounds
            </summary>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-600 w-24">
                  Default background
                </span>
                {renderBackgroundEditor(
                  defaultBackground,
                  setDefaultBackground,
                )}
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-1">
                <span className="text-xs text-gray-500">
                  Overrides are keyed by each page's first photo.
                </span>
                <button
                  onClick={() => {
                    setPageLayouts(new Map());
                    setPageBackgrounds(new Map());
                  }}
                  className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors font-medium"
                >
                  Reset page overrides
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {book.logicalPages.map((logicalPage) => {
                  const anchorId = logicalPage.anchorId;
                  if (!anchorId) return null;
                  const layout = pageLayouts.get(anchorId) ?? "auto";
                  const background =
                    pageBackgrounds.get(anchorId) ?? defaultBackground;

                  return (
                    <div
                      key={anchorId}
                      className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-1"
                    >
                      <span className="text-xs text-gray-600 w-14">
                        Page {logicalPage.pageNumber}
                      </span>
                      <select
                        value={layout}
                        onChange={(event) => {
                          const value = event.target.value as PageLayoutPreset;
                          const next = new Map(pageLayouts);
                          if (value === "auto") {
                            next.delete(anchorId);
                          } else {
                            next.set(anchorId, value);
                          }
                          setPageLayouts(next);
                        }}
                        className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                        title="Layout preset for this page"
                      >
                        <option value="auto">Auto layout</option>
                        {LAYOUT_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                      {renderBackgroundEditor(background, (spec) => {
                        const next = new Map(pageBackgrounds);
                        next.set(anchorId, spec);
                        setPageBackgrounds(next);
                      })}
                      <button
                        onClick={() => {
                          const nextLayouts = new Map(pageLayouts);
                          nextLayouts.delete(anchorId);
                          setPageLayouts(nextLayouts);
                          const nextBackgrounds = new Map(pageBackgrounds);
                          nextBackgrounds.delete(anchorId);
                          setPageBackgrounds(nextBackgrounds);
                        }}
                        className="text-xs px-2 py-0.5 bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
                        title="Reset this page's layout and background"
                      >
                        Reset
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </details>

          {/* Text box inspector (click a text box in the preview) */}
          {selectedTextBox && (
            <div className="p-2 bg-gray-50 rounded border border-blue-300">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-700">
                  Text box · {selectedTextBox.kind}
                </h3>
                <button
                  onClick={() => resetTextBoxOverride(selectedTextBox.id)}
                  className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors font-medium"
                  title="Reset this text box"
                >
                  Reset box
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.text ??
                    selectedTextBox.text
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      text: event.target.value,
                    })
                  }
                  placeholder="Text (empty = generated)"
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded w-48"
                  title="Text content; leave empty for the generated text"
                />
                <label className="text-xs text-gray-600">X</label>
                <input
                  type="number"
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.x ??
                    selectedTextBox.x
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      x: Number(event.target.value),
                    })
                  }
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded w-16"
                />
                <label className="text-xs text-gray-600">Y</label>
                <input
                  type="number"
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.y ??
                    selectedTextBox.y
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      y: Number(event.target.value),
                    })
                  }
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded w-16"
                />
                <label className="text-xs text-gray-600">W</label>
                <input
                  type="number"
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.width ??
                    selectedTextBox.width
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      width: Number(event.target.value),
                    })
                  }
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded w-16"
                />
                <select
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.fontFamily ??
                    selectedTextBox.fontFamily
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      fontFamily: event.target
                        .value as TextBox["fontFamily"],
                    })
                  }
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                  title="Font family"
                >
                  {TEXT_FONT_FAMILIES.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="6"
                  max="72"
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.fontSize ??
                    selectedTextBox.fontSize
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      fontSize: Number(event.target.value),
                    })
                  }
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded w-14"
                  title="Font size"
                />
                <input
                  type="color"
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.color ??
                    selectedTextBox.color
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      color: event.target.value,
                    })
                  }
                  className="h-6 w-8 border border-gray-300 rounded"
                  title="Text colour"
                />
                <select
                  value={
                    textBoxOverrides.get(selectedTextBox.id)?.align ??
                    selectedTextBox.align
                  }
                  onChange={(event) =>
                    updateTextBoxOverride(selectedTextBox.id, {
                      align: event.target.value as TextBox["align"],
                    })
                  }
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                  title="Text alignment"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={
                      textBoxOverrides.get(selectedTextBox.id)?.hidden ?? false
                    }
                    onChange={(event) =>
                      updateTextBoxOverride(selectedTextBox.id, {
                        hidden: event.target.checked,
                      })
                    }
                  />
                  Hidden
                </label>
                {selectedTextBox.kind !== "caption" && (
                  <select
                    value={
                      descriptionPositions.get(
                        selectedTextBox.id.split(":")[1],
                      ) || "bottom"
                    }
                    onChange={(event) => {
                      const assetId = selectedTextBox.id.split(":")[1];
                      const position = event.target.value as Position;
                      const next = new Map(descriptionPositions);
                      if (position === "bottom") {
                        next.delete(assetId);
                      } else {
                        next.set(assetId, position);
                      }
                      setDescriptionPositions(next);
                    }}
                    className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                    title="Description/date position (changes the photo layout)"
                  >
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                )}
              </div>
            </div>
          )}

          {/* 5. Customizations (only shown when there are any) */}
          {(customAspectRatios.size > 0 ||
            customOrdering !== null ||
            descriptionPositions.size > 0) && (
            <div className="p-2 bg-gray-50 rounded border border-gray-300">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <h3 className="text-xs font-semibold text-gray-700 sm:w-28">
                  Customizations
                </h3>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {customOrdering !== null && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        Custom order
                      </span>
                      <button
                        onClick={handleResetOrdering}
                        className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors font-medium"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                  {customAspectRatios.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        {customAspectRatios.size} aspect ratio
                      </span>
                      <button
                        onClick={handleResetAllCustomizations}
                        className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors font-medium"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                  {descriptionPositions.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-gray-600">
                        <span className="w-2 h-2 bg-purple-500 rounded-full" />
                        {descriptionPositions.size} label position
                      </span>
                      <button
                        onClick={handleResetDescriptionPositions}
                        className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors font-medium"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {mode === "pdf" ? (
        /* PDF Viewer */
        <div
          className="w-full"
          style={{ height: "calc(100vh - 200px)", minHeight: "400px" }}
        >
          <PDFViewer width="100%" height="100%" showToolbar={true}>
            <Document pageLayout={pageLayout}>
              {pages.map((pageData) => {
                // FIXME: pdfkit (internal of react-pdf) uses 72dpi internally and we downscale everything here;
                // instead we should produce a high-quality 300 dpi pdf

                // Convert page dimensions from 300 DPI to 72 DPI
                const pageWidth = toPoints(pageData.width);
                const pageHeight = toPoints(pageData.height);
                return (
                  <Page
                    key={pageData.pageNumber}
                    size={{
                      width: pageWidth,
                      height: pageHeight,
                    }}
                    style={staticStyles.page}
                  >
                    {/* Page break indicator for combined pages */}
                    {combinePages && (
                      <View
                        style={{
                          position: "absolute",
                          left: pageWidth / 2,
                          top: 0,
                          bottom: 0,
                          width: 1,
                          borderLeft: "1 dashed #D1D5DB",
                        }}
                      />
                    )}

                    {/* Page background (goal 7): colour, gradient or photo */}
                    {pageData.backgrounds.map((background, index) => {
                      const count = pageData.backgrounds.length;
                      const halfWidth = pageWidth / count;
                      const left = index * halfWidth;
                      const backgroundStyle = {
                        position: "absolute" as const,
                        left,
                        top: 0,
                        width: halfWidth,
                        height: pageHeight,
                      };

                      if (background.type === "color") {
                        return (
                          <View
                            key={`background-${index}`}
                            style={[
                              backgroundStyle,
                              { backgroundColor: background.color },
                            ]}
                          />
                        );
                      }

                      if (background.type === "gradient") {
                        const gradient = pdfGradient(background);
                        if (!gradient) return null;
                        const id = `gradient-${pageData.pageNumber}-${index}`;
                        const coordinates = gradientCoordinates(gradient.angle);
                        return (
                          <Svg
                            key={id}
                            style={backgroundStyle}
                            viewBox={`0 0 ${halfWidth} ${pageHeight}`}
                          >
                            <Defs>
                              <LinearGradient id={id} {...coordinates}>
                                <Stop offset="0%" stopColor={gradient.from} />
                                <Stop offset="100%" stopColor={gradient.to} />
                              </LinearGradient>
                            </Defs>
                            <Rect
                              x={0}
                              y={0}
                              width={halfWidth}
                              height={pageHeight}
                              fill={`url(#${id})`}
                            />
                          </Svg>
                        );
                      }

                      return (
                        <View key={`background-${index}`} style={backgroundStyle}>
                          {background.assetId ? (
                            <Image
                              src={thumbnailUrl(background.assetId)}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : null}
                          {background.dim > 0 && (
                            <View
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: "#000000",
                                opacity: background.dim,
                              }}
                            />
                          )}
                        </View>
                      );
                    })}

                    {pageData.photos.map((photoBox) => {
                      const imageUrl = `${immichConfig.baseUrl}/assets/${photoBox.asset.id}/thumbnail?size=preview&apiKey=${immichConfig.apiKey}`;
                      const descPosition =
                        descriptionPositions.get(photoBox.asset.id) || "bottom";
                      const hasDescription =
                        showDescriptions &&
                        !!photoBox.asset.exifInfo?.description;
                      const isLeftRight =
                        hasDescription &&
                        (descPosition === "left" || descPosition === "right");

                      // When description is on left/right, photoBox.width is already doubled by the layout algorithm
                      // So we use it as-is and split it between image and description
                      const containerWidth = toPoints(photoBox.width);
                      const imageWidth = isLeftRight
                        ? toPoints(photoBox.width) / 2
                        : toPoints(photoBox.width);

                      // Use absolute positioning for everything (no flex for left/right)
                      const containerStyle = [
                        staticStyles.photoContainer,
                        {
                          left: toPoints(photoBox.x),
                          top: toPoints(photoBox.y),
                          width: containerWidth,
                          height: toPoints(photoBox.height),
                        },
                      ];

                      return (
                        <View key={photoBox.asset.id} style={containerStyle}>
                          {/* Image - absolutely positioned */}
                          <Image
                            src={imageUrl}
                            style={
                              isLeftRight
                                ? {
                                    position: "absolute",
                                    left:
                                      descPosition === "left" ? imageWidth : 0,
                                    top: 0,
                                    width: imageWidth,
                                    height: toPoints(photoBox.height),
                                    objectFit: "cover",
                                  }
                                : staticStyles.photo
                            }
                          />
                        </View>
                      );
                    })}

                    {/* Text boxes (goals 4 & 6): rendered after photos so
                        text never ends up hidden under an image. */}
                    {pageData.textBoxes.map((box) => (
                      <Text
                        key={box.id}
                        hyphenationCallback={(word) => [word]}
                        style={{
                          position: "absolute",
                          left: toPoints(box.x),
                          top: toPoints(box.y),
                          width: toPoints(box.width),
                          fontFamily: box.fontFamily,
                          fontSize: box.fontSize,
                          color: box.color,
                          textAlign: box.align as "left" | "center" | "right",
                          backgroundColor: box.backgroundColor,
                          lineHeight: 1.3,
                        }}
                      >
                        {box.text}
                      </Text>
                    ))}
                  </Page>
                );
              })}
            </Document>
          </PDFViewer>
        </div>
      ) : (
        /* Live Preview */
        <div className="space-y-8 pb-8 overflow-x-auto px-4 sm:px-0">
          {pages.map((page) => {
            // Scale down to match PDF dimensions (72 DPI from 300 DPI)
            const displayWidth = toPoints(page.width);
            const displayHeight = toPoints(page.height);

            return (
              <div key={page.pageNumber} className="relative">
                {/* Page number and alignment controls */}
                {combinePages ? (
                  /* Combined pages mode - show controls above each logical page */
                  <div
                    className="mb-2 flex"
                    style={{
                      width: `${displayWidth}px`,
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    {/* Left page controls */}
                    <div
                      className="flex items-center justify-center gap-2"
                      style={{ width: `${displayWidth / 2}px` }}
                    >
                      <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                        Page {page.pageNumber * 2 - 1} of {totalLogicalPages}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            const leftPageNum = page.pageNumber * 2 - 1;
                            const newAlignments = new Map(pageAlignments);
                            newAlignments.set(leftPageNum, "left");
                            setPageAlignments(newAlignments);
                          }}
                          className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                            (pageAlignments.get(page.pageNumber * 2 - 1) ||
                              "left") === "left"
                              ? "bg-blue-500 text-white border-blue-500"
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                          title="Align to left"
                        >
                          <Icon path={mdiFormatAlignLeft} size={0.6} />
                        </button>
                        <button
                          onClick={() => {
                            const leftPageNum = page.pageNumber * 2 - 1;
                            const newAlignments = new Map(pageAlignments);
                            newAlignments.set(leftPageNum, "center");
                            setPageAlignments(newAlignments);
                          }}
                          className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                            (pageAlignments.get(page.pageNumber * 2 - 1) ||
                              "left") === "center"
                              ? "bg-blue-500 text-white border-blue-500"
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                          title="Align to center"
                        >
                          <Icon path={mdiFormatAlignCenter} size={0.6} />
                        </button>
                        <button
                          onClick={() => {
                            const leftPageNum = page.pageNumber * 2 - 1;
                            const newAlignments = new Map(pageAlignments);
                            newAlignments.set(leftPageNum, "right");
                            setPageAlignments(newAlignments);
                          }}
                          className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                            (pageAlignments.get(page.pageNumber * 2 - 1) ||
                              "left") === "right"
                              ? "bg-blue-500 text-white border-blue-500"
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                          title="Align to right"
                        >
                          <Icon path={mdiFormatAlignRight} size={0.6} />
                        </button>
                      </div>
                    </div>

                    {/* Right page controls (only if it exists) */}
                    {page.pageNumber * 2 <= totalLogicalPages && (
                      <div
                        className="flex items-center justify-center gap-2"
                        style={{ width: `${displayWidth / 2}px` }}
                      >
                        <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                          Page {page.pageNumber * 2} of {totalLogicalPages}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              const rightPageNum = page.pageNumber * 2;
                              const newAlignments = new Map(pageAlignments);
                              newAlignments.set(rightPageNum, "left");
                              setPageAlignments(newAlignments);
                            }}
                            className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                              (pageAlignments.get(page.pageNumber * 2) ||
                                "left") === "left"
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                            }`}
                            title="Align to left"
                          >
                            <Icon path={mdiFormatAlignLeft} size={0.6} />
                          </button>
                          <button
                            onClick={() => {
                              const rightPageNum = page.pageNumber * 2;
                              const newAlignments = new Map(pageAlignments);
                              newAlignments.set(rightPageNum, "center");
                              setPageAlignments(newAlignments);
                            }}
                            className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                              (pageAlignments.get(page.pageNumber * 2) ||
                                "left") === "center"
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                            }`}
                            title="Align to center"
                          >
                            <Icon path={mdiFormatAlignCenter} size={0.6} />
                          </button>
                          <button
                            onClick={() => {
                              const rightPageNum = page.pageNumber * 2;
                              const newAlignments = new Map(pageAlignments);
                              newAlignments.set(rightPageNum, "right");
                              setPageAlignments(newAlignments);
                            }}
                            className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                              (pageAlignments.get(page.pageNumber * 2) ||
                                "left") === "right"
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                            }`}
                            title="Align to right"
                          >
                            <Icon path={mdiFormatAlignRight} size={0.6} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Single page mode - center everything */
                  <div className="text-center mb-2 flex items-center justify-center gap-2">
                    <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                      Page {page.pageNumber} of {totalLogicalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          const newAlignments = new Map(pageAlignments);
                          newAlignments.set(page.pageNumber, "left");
                          setPageAlignments(newAlignments);
                        }}
                        className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                          (pageAlignments.get(page.pageNumber) || "left") ===
                          "left"
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                        }`}
                        title="Align to left"
                      >
                        <Icon path={mdiFormatAlignLeft} size={0.6} />
                      </button>
                      <button
                        onClick={() => {
                          const newAlignments = new Map(pageAlignments);
                          newAlignments.set(page.pageNumber, "center");
                          setPageAlignments(newAlignments);
                        }}
                        className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                          (pageAlignments.get(page.pageNumber) || "left") ===
                          "center"
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                        }`}
                        title="Align to center"
                      >
                        <Icon path={mdiFormatAlignCenter} size={0.6} />
                      </button>
                      <button
                        onClick={() => {
                          const newAlignments = new Map(pageAlignments);
                          newAlignments.set(page.pageNumber, "right");
                          setPageAlignments(newAlignments);
                        }}
                        className={`px-2 py-1 text-xs border rounded transition-colors flex items-center ${
                          (pageAlignments.get(page.pageNumber) || "left") ===
                          "right"
                            ? "bg-blue-500 text-white border-blue-500"
                            : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                        }`}
                        title="Align to right"
                      >
                        <Icon path={mdiFormatAlignRight} size={0.6} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Page container */}
                <div
                  className="relative bg-white shadow-lg mx-auto border border-gray-200"
                  style={{
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                  }}
                >
                  {/* Page background (goal 7) */}
                  {page.backgrounds.map((background, index) => {
                    const count = page.backgrounds.length;
                    const width = displayWidth / count;
                    const left = index * width;
                    return (
                      <div
                        key={`background-${index}`}
                        className="absolute top-0"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          height: `${displayHeight}px`,
                          zIndex: 0,
                          ...backgroundCss(
                            background,
                            background.type === "photo" ? thumbnailUrl(background.assetId) : undefined,
                          ),
                        }}
                      />
                    );
                  })}
                  
                  {/* Page break indicator for combined pages */}
                  {combinePages && (
                    <div
                      className="absolute top-0 bottom-0 border-l border-dashed border-gray-300 z-10 pointer-events-none"
                      style={{ left: `${displayWidth / 2}px` }}
                    />
                  )}

                  {/* Page background already drawn above; photos come next. */}

                  {/* Photos */}
                  {page.photos.map((photoBox) => {
                    const imageUrl = `${immichConfig.baseUrl}/assets/${photoBox.asset.id}/thumbnail?size=preview&apiKey=${immichConfig.apiKey}`;
                    const isDragging =
                      aspectDragState?.assetId === photoBox.asset.id;

                    // Calculate current aspect ratio
                    const naturalWidth =
                      photoBox.asset.exifInfo?.exifImageWidth || 1;
                    const naturalHeight =
                      photoBox.asset.exifInfo?.exifImageHeight || 1;
                    let currentAspectRatio = naturalWidth / naturalHeight;
                    if (photoBox.asset.exifInfo?.orientation == "6") {
                      currentAspectRatio = naturalHeight / naturalWidth;
                    }
                    // Use custom aspect ratio if set
                    const aspectRatio =
                      customAspectRatios.get(photoBox.asset.id) ||
                      currentAspectRatio;
                    const hasAspectRatioCustomization = customAspectRatios.has(
                      photoBox.asset.id,
                    );
                    const hasDescriptionPositionCustomization =
                      descriptionPositions.has(photoBox.asset.id);
                    const isCustomized =
                      hasAspectRatioCustomization ||
                      hasDescriptionPositionCustomization;

                    // Find global index in filtered assets for drag & drop
                    const globalIndex = filteredAssets.findIndex(
                      (a) => a.id === photoBox.asset.id,
                    );
                    const isBeingDragged =
                      reorderDragState?.draggedAssetId === photoBox.asset.id;
                    const isDropTarget = dropTargetIndex === globalIndex;

                    // Check if this asset has been reordered (compare to default filtered order)
                    const defaultIndex = defaultFilteredAssets.findIndex(
                      (a) => a.id === photoBox.asset.id,
                    );
                    const isReordered =
                      customOrdering !== null && globalIndex !== defaultIndex;

                    const descPosition =
                      descriptionPositions.get(photoBox.asset.id) || "bottom";
                    const hasDescription =
                      showDescriptions &&
                      !!photoBox.asset.exifInfo?.description;
                    const isLeftRight =
                      hasDescription &&
                      (descPosition === "left" || descPosition === "right");

                    // When description is on left/right, photoBox.width is already doubled by the layout algorithm
                    // So we use it as-is and split it between image and description
                    const containerWidth = toPoints(photoBox.width);
                    const imageWidth = isLeftRight
                      ? toPoints(photoBox.width) / 2
                      : toPoints(photoBox.width);

                    return (
                      <div
                        key={photoBox.asset.id}
                        className={`absolute overflow-hidden group cursor-move ${isBeingDragged ? "opacity-50" : ""} ${isLeftRight ? "flex" : ""}`}
                        style={{
                          left: `${toPoints(photoBox.x)}px`,
                          top: `${toPoints(photoBox.y)}px`,
                          width: `${containerWidth}px`,
                          height: `${toPoints(photoBox.height)}px`,
                          flexDirection: "row",
                        }}
                        draggable
                        onDragStart={(e) =>
                          handleReorderDragStart(
                            photoBox.asset.id,
                            globalIndex,
                            e,
                          )
                        }
                        onDragOver={(e) =>
                          handleReorderDragOver(globalIndex, e)
                        }
                        onDragEnd={handleReorderDragEnd}
                        onDrop={(e) => handleReorderDrop(globalIndex, e)}
                      >
                        {/* Drop indicator - shown on left edge when hovering during drag */}
                        {isDropTarget && reorderDragState && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 shadow-lg z-10" />
                        )}

                        {/* Spacer for left-side descriptions (text is now a text box) */}
                        {isLeftRight && descPosition === "left" && (
                          <div style={{ width: `${imageWidth}px`, flexShrink: 0 }} />
                        )}

                        <img
                          src={imageUrl}
                          alt={photoBox.asset.originalFileName}
                          className="object-cover w-full h-full"
                          style={
                            isLeftRight
                              ? { width: `${imageWidth}px`, flexShrink: 0 }
                              : undefined
                          }
                          loading="lazy"
                        />
                        {/* Dates are now rendered as text boxes */}
                        {/* Descriptions are now rendered as text boxes */}
                        {/* Spacer for right-side descriptions (text is now a text box) */}
                        {isLeftRight && descPosition === "right" && (
                          <div style={{ width: `${imageWidth}px`, flexShrink: 0 }} />
                        )}

                        {/* Customization indicators */}
                        {hasAspectRatioCustomization && (
                          <div
                            className="absolute top-2 left-2 w-2 h-2 bg-blue-500 rounded-full shadow-lg"
                            title="Aspect ratio customized"
                          />
                        )}
                        {hasDescriptionPositionCustomization && (
                          <div
                            className="absolute top-2 left-5 w-2 h-2 bg-purple-500 rounded-full shadow-lg"
                            title="Label position customized"
                          />
                        )}
                        {isReordered && (
                          <div
                            className="absolute top-2 left-8 w-2 h-2 bg-green-500 rounded-full shadow-lg"
                            title="Image reordered"
                          />
                        )}

                        {/* Reset button - shown on hover for customized images */}
                        {(isCustomized || isReordered) && (
                          <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded shadow-lg text-xs font-medium"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              // Reset aspect ratio
                              if (hasAspectRatioCustomization) {
                                setCustomAspectRatios((prev) => {
                                  const next = new Map(prev);
                                  next.delete(photoBox.asset.id);
                                  return next;
                                });
                              }
                              // Reset description position
                              if (hasDescriptionPositionCustomization) {
                                setDescriptionPositions((prev) => {
                                  const next = new Map(prev);
                                  next.delete(photoBox.asset.id);
                                  return next;
                                });
                              }
                              // Reset custom ordering by rebuilding the array without this asset
                              // This moves the asset back to its default position
                              if (isReordered && customOrdering) {
                                const assetId = photoBox.asset.id;
                                const defaultIndex = defaultFilteredAssets.findIndex(
                                  (a) => a.id === assetId,
                                );

                                // Remove asset from custom ordering
                                const newOrdering = customOrdering.filter(
                                  (id) => id !== assetId,
                                );

                                // Insert it back at its default position
                                newOrdering.splice(defaultIndex, 0, assetId);

                                setCustomOrdering(newOrdering);
                              }
                            }}
                            title="Reset all customizations"
                          >
                            Reset
                          </div>
                        )}

                        {/* Left drag handle */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize transition-colors ${
                            isDragging && aspectDragState.edge === "left"
                              ? "bg-blue-500"
                              : "bg-transparent group-hover:bg-blue-400/50"
                          }`}
                          onMouseDown={(e) =>
                            handleAspectDragStart(
                              photoBox.asset.id,
                              "left",
                              aspectRatio,
                              photoBox.x,
                              photoBox.width,
                              e,
                            )
                          }
                        />

                        {/* Right drag handle */}
                        <div
                          className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize transition-colors ${
                            isDragging && aspectDragState.edge === "right"
                              ? "bg-blue-500"
                              : "bg-transparent group-hover:bg-blue-400/50"
                          }`}
                          onMouseDown={(e) =>
                            handleAspectDragStart(
                              photoBox.asset.id,
                              "right",
                              aspectRatio,
                              photoBox.x,
                              photoBox.width,
                              e,
                            )
                          }
                        />
                      </div>
                    );
                  })}
                  {/* Text boxes (goals 4 & 6): drawn after photos so text
                    never ends up hidden under an image. */}
                  {page.textBoxes.map((box) => (
                    <div
                      key={box.id}
                      className={`absolute cursor-move ${
                        selectedTextBoxId === box.id
                          ? "ring-2 ring-blue-500"
                          : ""
                      }`}
                      style={{
                        left: `${toPoints(box.x)}px`,
                        top: `${toPoints(box.y)}px`,
                        width: `${toPoints(box.width)}px`,
                        fontFamily: fontCss(box.fontFamily),
                        fontSize: `${box.fontSize}px`,
                        color: box.color,
                        textAlign: box.align,
                        backgroundColor: box.backgroundColor,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.3,
                        zIndex: 20,
                        padding: "2px 4px",
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTextBoxId(box.id);
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedTextBoxId(box.id);
                        setTextDragState({
                          id: box.id,
                          startX: event.clientX,
                          startY: event.clientY,
                          originalX: box.x,
                          originalY: box.y,
                        });
                      }}
                    >
                      {box.text}
                    </div>
                  ))}

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PhotoGrid;
