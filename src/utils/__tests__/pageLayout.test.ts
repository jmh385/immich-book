jest.mock("@immich/justified-layout-wasm");

import { calculatePageLayout } from "../pageLayout";
import { testAsset } from "./testAssets";

const PAGE = {
  pageSize: "CUSTOM" as const,
  orientation: "portrait" as const,
  customWidth: 1200,
  customHeight: 1600,
  margin: 100,
  rowHeight: 400,
  spacing: 20,
};

const assets = (count: number, ratio = 0.6) =>
  Array.from({ length: count }, (_, i) =>
    testAsset({ id: `p${i}`, ratio }),
  );

describe("calculatePageLayout (defaults)", () => {
  it("keeps all photos inside the content area", () => {
    const pages = calculatePageLayout(assets(6), PAGE);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.width).toBe(1200);
      expect(page.height).toBe(1600);
      for (const photo of page.photos) {
        expect(photo.x).toBeGreaterThanOrEqual(PAGE.margin);
        expect(photo.y).toBeGreaterThanOrEqual(PAGE.margin);
        expect(photo.x + photo.width).toBeLessThanOrEqual(
          PAGE.customWidth - PAGE.margin + 0.01,
        );
        expect(photo.y + photo.height).toBeLessThanOrEqual(
          PAGE.customHeight - PAGE.margin + 0.01,
        );
      }
    }
    expect(pages.flatMap((page) => page.photos)).toHaveLength(6);
  });

  it("paginates when rows no longer fit", () => {
    const pages = calculatePageLayout(assets(12), {
      ...PAGE,
      rowHeight: 700,
    });
    expect(pages.length).toBeGreaterThan(1);
  });

  it("returns no pages without assets", () => {
    expect(calculatePageLayout([], PAGE)).toEqual([]);
  });

  it("shifts rows for page alignment", () => {
    const pages = calculatePageLayout(assets(4), {
      ...PAGE,
      pageAlignments: new Map([[1, "right"]]),
    });
    const lastPhoto = pages[0].photos[pages[0].photos.length - 1];
    // Last row holds a single photo, right aligned to the content edge.
    expect(lastPhoto.x + lastPhoto.width).toBeCloseTo(1200 - PAGE.margin);
  });
});

describe("calculatePageLayout group boundaries", () => {
  it("starts a new page at every group boundary", () => {
    const list = assets(4);
    const pages = calculatePageLayout(list, {
      ...PAGE,
      groupBoundaries: [2],
    });

    expect(pages).toHaveLength(2);
    expect(pages[0].photos.map((photo) => photo.asset.id)).toEqual(["p0", "p1"]);
    expect(pages[1].photos.map((photo) => photo.asset.id)).toEqual(["p2", "p3"]);
  });

  it("keeps later pages of a group free of the group label", () => {
    const pages = calculatePageLayout(assets(12), {
      ...PAGE,
      rowHeight: 700,
      groupBoundaries: [4, 8],
      groupLabels: ["One", "Two", "Three"],
    });
    expect(pages[0].groupLabel).toBe("One");
    const secondPageOfFirstGroup = pages.find(
      (page) => page.pageNumber === 2,
    );
    expect(secondPageOfFirstGroup?.groupLabel).toBeUndefined();
    expect(pages.map((page) => page.groupLabel).filter(Boolean)).toEqual([
      "One",
      "Two",
      "Three",
    ]);
  });

  it("moves labels to their halves when combining pages", () => {
    const pages = calculatePageLayout(assets(4), {
      ...PAGE,
      combinePages: true,
      groupBoundaries: [1, 2, 3],
      groupLabels: ["A", "B", "C", "D"],
    });

    expect(pages).toHaveLength(2);
    expect(pages[0].groupLabel).toBe("A");
    expect(pages[0].groupLabelRight).toBe("B");
    expect(pages[1].groupLabel).toBe("C");
    expect(pages[1].groupLabelRight).toBe("D");
    expect(pages[0].width).toBe(2400);
  });
});

describe("calculatePageLayout styles", () => {
  it("fills the content area for a spotlight group", () => {
    const [page] = calculatePageLayout(assets(1), {
      ...PAGE,
      segmentStyles: ["spotlight"],
    });
    expect(page.photos).toHaveLength(1);
    expect(page.photos[0]).toMatchObject({
      x: PAGE.margin,
      y: PAGE.margin,
      width: 1000,
      height: 1400,
    });
  });

  it("gives every photo its own page in spotlight style", () => {
    const pages = calculatePageLayout(assets(3), {
      ...PAGE,
      segmentStyles: ["spotlight"],
    });
    expect(pages).toHaveLength(3);
    for (const page of pages) {
      expect(page.photos).toHaveLength(1);
    }
  });

  it("puts a full-width photo above justified rows in mixed style", () => {
    const pages = calculatePageLayout(assets(3), {
      ...PAGE,
      segmentStyles: ["mixed"],
    });

    const first = pages[0].photos[0];
    expect(first.asset.id).toBe("p0");
    expect(first.x).toBe(PAGE.margin);
    expect(first.y).toBe(PAGE.margin);
    expect(first.width).toBe(1000);
    // 0.6 ratio would need 1666 px, so the half-content-area cap (700) wins.
    expect(first.height).toBeCloseTo(700, 1);

    // The next photo starts below the large one.
    const second = pages[0].photos[1];
    expect(second.asset.id).toBe("p1");
    expect(second.y).toBeGreaterThan(first.y + first.height);
  });

  it("supports a different style per group", () => {
    const list = assets(3);
    const pages = calculatePageLayout(list, {
      ...PAGE,
      groupBoundaries: [1, 2],
      segmentStyles: ["spotlight", "spotlight", "mixed"],
    });

    expect(pages[0].photos[0].asset.id).toBe("p0");
    expect(pages[0].photos[0].width).toBe(1000);
    expect(pages[1].photos[0].asset.id).toBe("p1");
    expect(pages[2].photos[0].asset.id).toBe("p2");
  });
});
