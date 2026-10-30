import {
  assetLocalDay,
  assetLocation,
  assetPeople,
  autoLayoutStyleFor,
  groupAssets,
  pickAutoCriteria,
} from "../photoGrouping";
import { testAsset } from "./testAssets";

describe("asset facts", () => {
  it("prefers localDateTime for the calendar day", () => {
    const asset = testAsset({
      day: "2026-07-14",
      localDateTime: "2026-07-15T01:00:00.000Z",
    });
    expect(assetLocalDay(asset)).toBe("2026-07-15");
  });

  it("falls back to fileCreatedAt", () => {
    const asset = testAsset({
      day: "2026-07-14",
      localDateTime: null,
    });
    expect(assetLocalDay(asset)).toBe("2026-07-14");
  });

  it("prefers city over state over country for the location", () => {
    expect(
      assetLocation(
        testAsset({ city: "Funchal", state: "Madeira", country: "Portugal" }),
      ),
    ).toBe("Funchal");
    expect(
      assetLocation(testAsset({ state: "Madeira", country: "Portugal" })),
    ).toBe("Madeira");
    expect(assetLocation(testAsset({ country: "Portugal" }))).toBe("Portugal");
    expect(assetLocation(testAsset())).toBeNull();
  });

  it("collects distinct sorted people names", () => {
    expect(assetPeople(testAsset({ people: ["Bob", "Alice", "Bob"] }))).toEqual([
      "Alice",
      "Bob",
    ]);
  });
});

describe("groupAssets", () => {
  it("returns no groups for no assets", () => {
    expect(groupAssets([], ["date"])).toEqual([]);
  });

  it("keeps everything in one group without criteria", () => {
    const assets = [testAsset(), testAsset()];
    const groups = groupAssets(assets, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].assets).toHaveLength(2);
  });

  it("splits by calendar day", () => {
    const assets = [
      testAsset({ day: "2026-07-14", id: "a" }),
      testAsset({ day: "2026-07-14", id: "b" }),
      testAsset({ day: "2026-07-15", id: "c" }),
    ];
    const groups = groupAssets(assets, ["date"]);
    expect(groups).toHaveLength(2);
    expect(groups[0].assets.map((a) => a.id)).toEqual(["a", "b"]);
    expect(groups[1].assets.map((a) => a.id)).toEqual(["c"]);
    expect(groups[1].startDate).toBe("2026-07-15");
  });

  it("splits by location runs without merging non-contiguous places", () => {
    const assets = [
      testAsset({ city: "Funchal", id: "a" }),
      testAsset({ city: "Funchal", id: "b" }),
      testAsset({ city: "Lisbon", id: "c" }),
      testAsset({ city: "Funchal", id: "d" }),
    ];
    const groups = groupAssets(assets, ["location"]);
    expect(groups.map((group) => group.assets.map((a) => a.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
  });

  it("splits by the people shown", () => {
    const assets = [
      testAsset({ people: ["Alice"], id: "a" }),
      testAsset({ people: ["Alice"], id: "b" }),
      testAsset({ people: ["Bob"], id: "c" }),
      testAsset({ people: [], id: "d" }),
    ];
    const groups = groupAssets(assets, ["person"]);
    expect(groups.map((group) => group.assets.length)).toEqual([2, 1, 1]);
    expect(groups[0].people).toEqual(["Alice"]);
    expect(groups[2].people).toEqual([]);
  });

  it("applies criteria hierarchically (location runs, then days)", () => {
    const assets = [
      testAsset({ city: "Funchal", day: "2026-07-14", id: "a" }),
      testAsset({ city: "Funchal", day: "2026-07-15", id: "b" }),
      testAsset({ city: "Lisbon", day: "2026-07-15", id: "c" }),
    ];
    const groups = groupAssets(assets, ["location", "date"]);
    expect(groups.map((group) => group.assets.map((a) => a.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("keeps asset order and records the first asset of each group", () => {
    const assets = [
      testAsset({ day: "2026-07-14", id: "a" }),
      testAsset({ day: "2026-07-15", id: "b" }),
      testAsset({ day: "2026-07-15", id: "c" }),
    ];
    const groups = groupAssets(assets, ["date"]);
    expect(groups[0].firstAssetId).toBe("a");
    expect(groups[1].firstAssetId).toBe("b");
    expect(groups.flatMap((group) => group.assets.map((a) => a.id))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("derives group facts for captions", () => {
    const assets = [
      testAsset({
        day: "2026-07-14",
        city: "Funchal",
        people: ["Bob"],
      }),
      testAsset({
        day: "2026-07-16",
        city: "Funchal",
        people: ["Alice"],
      }),
      // Missing location must not override the majority.
      testAsset({ day: "2026-07-16", city: null, people: [] }),
    ];
    const [group] = groupAssets(assets, []);
    expect(group.startDate).toBe("2026-07-14");
    expect(group.endDate).toBe("2026-07-16");
    expect(group.location).toBe("Funchal");
    expect(group.people).toEqual(["Alice", "Bob"]);
  });
});

describe("pickAutoCriteria", () => {
  it("uses location first when the album spans places", () => {
    const assets = [
      testAsset({ city: "Funchal", day: "2026-07-14" }),
      testAsset({ city: "Lisbon", day: "2026-07-15" }),
    ];
    expect(pickAutoCriteria(assets)).toEqual(["location", "date"]);
  });

  it("uses days plus people when most photos show people", () => {
    const assets = [
      testAsset({ day: "2026-07-14", people: ["Alice"] }),
      testAsset({ day: "2026-07-15", people: ["Bob"] }),
    ];
    expect(pickAutoCriteria(assets)).toEqual(["date", "person"]);
  });

  it("uses days when the album spans days without people", () => {
    const assets = [
      testAsset({ day: "2026-07-14" }),
      testAsset({ day: "2026-07-15" }),
    ];
    expect(pickAutoCriteria(assets)).toEqual(["date"]);
  });

  it("uses people when everything happened on one day", () => {
    const assets = [
      testAsset({ people: ["Alice"] }),
      testAsset({ people: [] }),
    ];
    expect(pickAutoCriteria(assets)).toEqual(["person"]);
  });

  it("keeps a single group when there is nothing to split by", () => {
    expect(pickAutoCriteria([testAsset()])).toEqual([]);
    expect(
      pickAutoCriteria([testAsset(), testAsset()]),
    ).toEqual([]);
  });
});

describe("autoLayoutStyleFor", () => {
  it("gives single photos a spotlight page", () => {
    const [group] = groupAssets([testAsset()], []);
    expect(autoLayoutStyleFor(group)).toBe("spotlight");
  });

  it("uses a large first photo plus rows for small groups", () => {
    const [group] = groupAssets([testAsset(), testAsset(), testAsset()], []);
    expect(autoLayoutStyleFor(group)).toBe("mixed");
  });

  it("falls back to justified rows for larger groups", () => {
    const [group] = groupAssets(
      [testAsset(), testAsset(), testAsset(), testAsset()],
      [],
    );
    expect(autoLayoutStyleFor(group)).toBe("justified");
  });
});
