jest.mock("@immich/justified-layout-wasm");

import { buildBookLayout, criteriaForMode } from "../book";
import { testAsset } from "./testAssets";

const baseOptions = {
  pageSize: "CUSTOM" as const,
  orientation: "portrait" as const,
  customWidth: 1200,
  customHeight: 1600,
  margin: 100,
  rowHeight: 400,
  spacing: 20,
};

describe("criteriaForMode", () => {
  it("maps explicit modes and derives auto/off", () => {
    const twoDays = [
      testAsset({ day: "2026-07-14" }),
      testAsset({ day: "2026-07-15" }),
    ];
    expect(criteriaForMode("off", twoDays)).toEqual([]);
    expect(criteriaForMode("day", twoDays)).toEqual(["date"]);
    expect(criteriaForMode("location", twoDays)).toEqual(["location"]);
    expect(criteriaForMode("person", twoDays)).toEqual(["person"]);
    expect(criteriaForMode("auto", twoDays)).toEqual(["date"]);
  });
});

describe("buildBookLayout", () => {
  const trip = [
    testAsset({
      id: "a1",
      day: "2026-07-14",
      city: "Funchal",
      people: ["Alice"],
      ratio: 0.6,
    }),
    testAsset({
      id: "a2",
      day: "2026-07-14",
      city: "Funchal",
      people: ["Alice", "Bob"],
      ratio: 0.6,
    }),
    testAsset({
      id: "a3",
      day: "2026-07-15",
      city: "Funchal",
      people: ["Bob"],
      ratio: 0.6,
    }),
    testAsset({
      id: "b1",
      day: "2026-07-16",
      city: "Lisbon",
      people: ["Alice"],
      ratio: 0.6,
    }),
  ];

  it("returns an empty book without assets", () => {
    expect(
      buildBookLayout([], {
        ...baseOptions,
        groupingMode: "auto",
        layoutStyle: "auto",
        showGroupLabels: true,
      }),
    ).toEqual({
      pages: [],
      logicalPages: [],
      groups: [],
      styles: [],
      labels: [],
    });
  });

  it("groups by day and starts each group on a new page", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "day",
      layoutStyle: "justified",
      showGroupLabels: true,
      labelLocale: "en-GB",
    });

    expect(book.groups.map((group) => group.assets.length)).toEqual([2, 1, 1]);
    expect(book.pages[0].photos.map((photo) => photo.asset.id)).toEqual([
      "a1",
      "a2",
    ]);

    const labels = book.pages
      .map((page) => page.groupLabel)
      .filter((label): label is string => !!label);
    expect(labels).toEqual([
      "Funchal, 14 July 2026, with Alice & Bob",
      "Funchal, 15 July 2026, with Bob",
      "Lisbon, 16 July 2026, with Alice",
    ]);
  });

  it("keeps the album in one group when grouping is off", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "off",
      layoutStyle: "justified",
      showGroupLabels: true,
      labelLocale: "en-GB",
    });

    expect(book.groups).toHaveLength(1);
    expect(book.labels).toEqual([
      "Funchal, 14–16 July 2026, with Alice & Bob",
    ]);
  });

  it("applies an automatic layout style per group", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "day",
      layoutStyle: "auto",
      showGroupLabels: true,
      labelLocale: "en-GB",
    });

    // Two-photo day -> mixed, one-photo days -> spotlight.
    expect(book.styles).toEqual(["mixed", "spotlight", "spotlight"]);
    expect(book.pages[0].photos[0].width).toBe(1000);
  });

  it("applies a fixed layout style to every group", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "day",
      layoutStyle: "spotlight",
      showGroupLabels: false,
    });

    expect(book.styles).toEqual(["spotlight", "spotlight", "spotlight"]);
    expect(book.pages.every((page) => page.photos.length === 1)).toBe(true);
  });

  it("leaves captions out when disabled", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "day",
      layoutStyle: "auto",
      showGroupLabels: false,
    });

    expect(book.labels).toEqual([null, null, null]);
    expect(book.pages.some((page) => page.groupLabel)).toBe(false);
  });

  it("groups automatically by location then day", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "auto",
      layoutStyle: "justified",
      showGroupLabels: true,
      labelLocale: "en-GB",
    });

    expect(book.groups.map((group) => group.assets.length)).toEqual([2, 1, 1]);
    expect(book.groups.map((group) => group.location)).toEqual([
      "Funchal",
      "Funchal",
      "Lisbon",
    ]);
  });

  it("lets a manual caption override replace the generated one", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "day",
      layoutStyle: "justified",
      showGroupLabels: true,
      labelLocale: "en-GB",
      labelOverrides: { a1: "Our first day", a3: "   " },
    });

    // Blank overrides fall back to the generated caption.
    expect(book.labels).toEqual([
      "Our first day",
      "Funchal, 15 July 2026, with Bob",
      "Lisbon, 16 July 2026, with Alice",
    ]);
    expect(book.pages[0].groupLabel).toBe("Our first day");
  });

  it("ignores caption overrides when captions are disabled", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      groupingMode: "day",
      layoutStyle: "justified",
      showGroupLabels: false,
      labelOverrides: { a1: "Hidden" },
    });

    expect(book.labels).toEqual([null, null, null]);
    expect(book.pages.some((page) => page.groupLabel)).toBe(false);
  });

  it("carries group captions through combined pages", () => {
    const book = buildBookLayout(trip, {
      ...baseOptions,
      combinePages: true,
      groupingMode: "day",
      layoutStyle: "spotlight",
      showGroupLabels: true,
      labelLocale: "en-GB",
    });

    // Spotlight gives the two-photo day two logical pages, so the first
    // combined sheet holds two pages of one group and the second sheet holds
    // the remaining two groups.
    expect(book.pages).toHaveLength(2);
    expect(book.pages[0].groupLabel).toBe(
      "Funchal, 14 July 2026, with Alice & Bob",
    );
    expect(book.pages[0].groupLabelRight).toBeUndefined();
    expect(book.pages[1].groupLabel).toBe(
      "Funchal, 15 July 2026, with Bob",
    );
    expect(book.pages[1].groupLabelRight).toBe(
      "Lisbon, 16 July 2026, with Alice",
    );
  });
});
