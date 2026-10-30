/**
 * Runnable example for TASKS.md goals 1-3 — no Immich server, no network.
 *
 * Runs the real grouping / auto-layout / caption pipeline on mock assets and
 * renders a PDF where every photo is a placeholder rectangle (the app would
 * draw Immich thumbnails there). Artifacts are written to `example/`:
 *
 * - immich-book-example.pdf   the generated book
 * - example-summary.json      groups, chosen styles and captions as data
 *
 * Run with `npm test -- exampleBook` and inspect the files.
 */
import * as fs from "fs";
import * as path from "path";

import { buildBookLayout } from "../book";
import type { Page as BookPage } from "../pageLayout";
import { renderExamplePdf, type ExamplePageSpec } from "../examplePdf";
import { testAsset } from "./testAssets";

// Same page geometry as the app's defaults (2515 x 3260 px at 300 DPI).
const PAGE_PX = {
  pageSize: "CUSTOM" as const,
  orientation: "portrait" as const,
  customWidth: 2515,
  customHeight: 3260,
  margin: 118,
  rowHeight: 994,
  spacing: 20,
};

const toPoints = (pixels: number) => pixels * (72 / 300);

const COLORS: Array<[number, number, number]> = [
  [219, 234, 254],
  [253, 230, 138],
  [187, 247, 208],
  [254, 202, 202],
  [233, 213, 255],
];

/** 14 mock photos: a Madeira week, a Lisbon day, a Porto day. */
function exampleAssets() {
  const madeira = (id: string, day: string, time: string, people: string[], ratio: number) =>
    testAsset({ id, day, time, city: "Funchal", country: "Portugal", people, ratio });
  const lisbon = (id: string, time: string, people: string[], ratio: number) =>
    testAsset({ id, day: "2026-07-23", time, city: "Lisbon", country: "Portugal", people, ratio });
  const porto = (id: string, time: string, people: string[], ratio: number) =>
    testAsset({ id, day: "2026-07-24", time, city: "Porto", country: "Portugal", people, ratio });

  return [
    madeira("madeira-1", "2026-07-14", "09:00:00", ["Alice"], 1.5),
    madeira("madeira-2", "2026-07-14", "11:00:00", ["Alice", "Bob"], 0.66),
    madeira("madeira-3", "2026-07-14", "15:00:00", ["Bob"], 1.5),
    madeira("madeira-4", "2026-07-15", "10:00:00", ["Alice"], 0.66),
    madeira("madeira-5", "2026-07-15", "13:00:00", ["Alice", "Bob"], 1.5),
    madeira("madeira-6", "2026-07-15", "17:00:00", ["Bob"], 0.66),
    madeira("madeira-7", "2026-07-22", "12:00:00", ["Alice"], 0.75),
    lisbon("lisbon-1", "09:00:00", ["Alice", "Bob"], 1.5),
    lisbon("lisbon-2", "12:00:00", ["Alice"], 0.66),
    lisbon("lisbon-3", "18:00:00", ["Bob"], 1.5),
    porto("porto-1", "10:00:00", ["Alice"], 1.5),
    porto("porto-2", "11:30:00", ["Bob"], 0.66),
    porto("porto-3", "14:00:00", [], 1.5),
    porto("porto-4", "16:00:00", ["Alice"], 0.66),
  ];
}

/** Layout boxes → simple PDF page specs (rectangles + captions). */
function toPageSpecs(pages: BookPage[]): ExamplePageSpec[] {
  return pages.map((page) => ({
    width: toPoints(page.width),
    height: toPoints(page.height),
    rects: page.photos.map((photo, index) => ({
      x: toPoints(photo.x),
      y: toPoints(photo.y),
      width: toPoints(photo.width),
      height: toPoints(photo.height),
      label: photo.asset.originalFileName,
      color: COLORS[index % COLORS.length],
    })),
    caption: page.groupLabel ?? undefined,
    footer: `Page ${page.pageNumber} of ${pages.length}`,
  }));
}

describe("example book (no Immich, no network)", () => {
  it("builds and renders a grouped book with automatic layouts and captions", () => {
    const assets = exampleAssets();

    const book = buildBookLayout(assets, {
      ...PAGE_PX,
      groupingMode: "auto",
      layoutStyle: "auto",
      showGroupLabels: true,
      labelLocale: "en-GB",
    });

    // Grouping: location runs, then days within them.
    expect(book.groups).toHaveLength(5);
    expect(book.groups.map((group) => group.location)).toEqual([
      "Funchal",
      "Funchal",
      "Funchal",
      "Lisbon",
      "Porto",
    ]);

    // Automatic layouts: 3-photo days are mixed, the single photo is a
    // spotlight page, the 4-photo day falls back to justified rows.
    expect(book.styles).toEqual([
      "mixed",
      "mixed",
      "spotlight",
      "mixed",
      "justified",
    ]);

    // Automatic captions from location, date range and people.
    expect(book.labels).toEqual([
      "Funchal, 14 July 2026, with Alice & Bob",
      "Funchal, 15 July 2026, with Alice & Bob",
      "Funchal, 22 July 2026, with Alice",
      "Lisbon, 23 July 2026, with Alice & Bob",
      "Porto, 24 July 2026, with Alice & Bob",
    ]);

    // A caption sits on the first page of each group only.
    const labelledPages = book.pages.filter((page) => page.groupLabel);
    expect(labelledPages).toHaveLength(5);

    // Every group fits on a single page here, so the book has one page per
    // group: 3, 3, 1, 3 and 4 photos.
    expect(book.pages.map((page) => page.photos.length)).toEqual([
      3, 3, 1, 3, 4,
    ]);

    // Every asset appears exactly once across the pages.
    const placedIds = book.pages.flatMap((page) =>
      page.photos.map((photo) => photo.asset.id),
    );
    expect(placedIds).toHaveLength(assets.length);
    expect(new Set(placedIds).size).toBe(assets.length);

    const pdf = renderExamplePdf(toPageSpecs(book.pages));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(2000);

    const outputDir = path.join(process.cwd(), "example");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "immich-book-example.pdf"), pdf);
    fs.writeFileSync(
      path.join(outputDir, "example-summary.json"),
      JSON.stringify(
        {
          generatedBy: "src/utils/__tests__/exampleBook.test.ts (npm test)",
          pageGeometry: PAGE_PX,
          assets: assets.length,
          pages: book.pages.length,
          groups: book.groups.map((group, index) => ({
            label: book.labels[index],
            style: book.styles[index],
            photos: group.assets.map((asset) => asset.originalFileName),
            location: group.location,
            people: group.people,
            startDate: group.startDate,
            endDate: group.endDate,
          })),
          pageBreakdown: book.pages.map((page) => ({
            page: page.pageNumber,
            caption: page.groupLabel ?? null,
            photos: page.photos.map((photo) => photo.asset.originalFileName),
          })),
        },
        null,
        2,
      ),
    );

    // Visible in the test output for a quick sanity read.
    console.log(
      [
        `Example book: ${assets.length} photos -> ${book.groups.length} groups, ${book.pages.length} pages`,
        ...book.groups.map(
          (_, index) =>
            `  ${book.styles[index].padEnd(9)} | ${book.labels[index]}`,
        ),
        "Written to example/immich-book-example.pdf and example/example-summary.json",
      ].join("\n"),
    );
  });
});
