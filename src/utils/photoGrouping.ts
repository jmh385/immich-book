/**
 * Automatic grouping of a (chronologically ordered) photo stream into
 * contiguous groups, used to split albums into pages.
 *
 * Pure logic, no SDK imports: assets only need the fields used below, which
 * makes it testable with Jest without the Immich SDK or a network.
 */

export type GroupCriterion = "date" | "location" | "person";

/** Minimal structural form of `AssetResponseDto` needed for grouping. */
export interface GroupableAsset {
  id: string;
  /** UTC timestamp; local date derivation falls back to this. */
  fileCreatedAt?: string;
  /** Immich timezone-agnostic local timestamp, preferred for calendar days. */
  localDateTime?: string;
  people?: { name?: string | null }[];
  exifInfo?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
}

export interface PhotoGroup<A extends GroupableAsset = GroupableAsset> {
  /** Deterministic id built from the criteria keys of the group. */
  id: string;
  /** Asset id of the first member; segment starts are derived from it. */
  firstAssetId: string;
  assets: A[];
  criteria: GroupCriterion[];
  /** Inclusive calendar dates "YYYY-MM-DD" of first and last member. */
  startDate: string | null;
  endDate: string | null;
  /** Most complete location name found in the group, null when unknown. */
  location: string | null;
  /** Distinct people names across the group's assets. */
  people: string[];
}

/**
 * Local calendar date ("YYYY-MM-DD") of an asset. Uses Immich's
 * timezone-agnostic localDateTime when present, otherwise falls back to the
 * UTC timestamp interpreted in the viewer's local time.
 */
export function assetLocalDay(asset: GroupableAsset): string | null {
  const raw = asset.localDateTime || asset.fileCreatedAt;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Most complete place name available: city, else state, else country. */
export function assetLocation(asset: GroupableAsset): string | null {
  const exif = asset.exifInfo;
  const city = exif?.city?.trim() || null;
  if (city) return city;
  const state = exif?.state?.trim() || null;
  if (state) return state;
  const country = exif?.country?.trim() || null;
  return country || null;
}

/**
 * Sorted list of distinct people names, primary sorting key so that the same
 * set of people always yields the same group key.
 */
export function assetPeople(asset: GroupableAsset): string[] {
  const names = (asset.people ?? [])
    .map((person) => person?.name?.trim())
    .filter((name): name is string => !!name);
  return [...new Set(names)].sort();
}

/** Stable comparable key for a criterion. Two assets share a group run while the key does not change. */
function criterionKey(
  asset: GroupableAsset,
  criterion: GroupCriterion,
): string {
  switch (criterion) {
    case "date":
      return assetLocalDay(asset) ?? "no-date";
    case "location":
      return assetLocation(asset) ?? "no-location";
    case "person": {
      const people = assetPeople(asset);
      if (people.length === 0) return "";
      return people.join("|");
    }
  }
}

function criteriaKey(asset: GroupableAsset, criteria: GroupCriterion[]): string {
  return criteria.map((criterion) => criterionKey(asset, criterion)).join("||");
}

/**
 * Split the asset sequence into contiguous groups. The criteria are applied
 * hierarchically in the given order: first the whole stream is cut where the
 * first criterion's key changes, then each resulting run is cut again where
 * the second criterion changes, and so on. Asset order is never changed.
 */
export function groupAssets<A extends GroupableAsset>(
  assets: A[],
  criteria: GroupCriterion[],
): PhotoGroup<A>[] {
  if (assets.length === 0) return [];

  // Start with runs of the full criteria key in asset order, so that the
  // hierarchical application is just a refinement of these runs.
  const runs: A[][] = [];
  let currentRun: A[] = [assets[0]];
  let currentKey = criteriaKey(assets[0], criteria);
  for (let i = 1; i < assets.length; i++) {
    const key = criteriaKey(assets[i], criteria);
    if (key !== currentKey) {
      runs.push(currentRun);
      currentRun = [];
      currentKey = key;
    }
    currentRun.push(assets[i]);
  }
  runs.push(currentRun);

  return runs.map((run, runIndex) => {
    const days = run
      .map((asset) => assetLocalDay(asset))
      .filter((day): day is string => !!day)
      .sort();
    const start = days[0] ?? null;
    const end = days[days.length - 1] ?? null;

    const locations = run
      .map((asset) => assetLocation(asset))
      .filter((location): location is string => !!location);
    // Prefer the location that appears most often, ties broken by first
    // appearance, because a run may briefly lack EXIF location data.
    const locationCounts = new Map<string, number>();
    for (const location of locations) {
      // eslint-disable-next-line no-plusplus
      locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);
    }
    let location: string | null = null;
    let best = 0;
    for (const [candidate, count] of locationCounts) {
      if (count > best) {
        location = candidate;
        best = count;
      }
    }

    const people = [...new Set(run.flatMap((asset) => assetPeople(asset)))].sort();

    const id = `g${runIndex}-${run[0].id}`;
    return {
      id,
      firstAssetId: run[0].id,
      assets: run,
      criteria: [...criteria],
      startDate: start,
      endDate: end,
      location,
      people,
    };
  });
}

/**
 * Heuristic grouping criteria for `groupingMode: "auto"`. Chooses the
 * dominant available signal, with more specific places taking precedence over
 * people over plain calendar splitting. An empty result means the album stays
 * in one group.
 */
export function pickAutoCriteria(assets: GroupableAsset[]): GroupCriterion[] {
  if (assets.length <= 1) return [];

  const locations = new Set(
    assets
      .map((asset) => assetLocation(asset))
      .filter((location): location is string => !!location),
  );
  const days = new Set(
    assets
      .map((asset) => assetLocalDay(asset))
      .filter((day): day is string => !!day),
  );
  const withPeople = assets.filter((asset) => assetPeople(asset).length > 0);

  if (locations.size > 1) return ["location", "date"];
  if (days.size > 1 && withPeople.length > assets.length / 2) {
    return ["date", "person"];
  }
  if (days.size > 1) return ["date"];
  if (withPeople.length > 0) return ["person"];
  return [];
}

/**
 * Automatic layout style for a group (TASKS.md goal 1: apply additional layout
 * options automatically):
 * - a single photo gets a full-page spotlight
 * - small groups (up to 3) get a large first photo plus justified rows
 * - everything else falls back to the ordinary justified rows
 */
export function autoLayoutStyleFor(
  group: PhotoGroup,
): "spotlight" | "mixed" | "justified" {
  if (group.assets.length <= 1) return "spotlight";
  if (group.assets.length <= 3) return "mixed";
  return "justified";
}
