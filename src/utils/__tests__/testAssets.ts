/**
 * Test fixtures: complete Immich asset objects with just enough EXIF/people
 * data for grouping, layout and caption logic. Fully typed (no casts), so the
 * fixture also guards against SDK type changes.
 */
import type {
  AssetResponseDto,
  AssetTypeEnum,
  AssetVisibility,
  PersonResponseDto,
} from "@immich/sdk";

let sequence = 0;

export interface TestAssetOptions {
  id?: string;
  /** "YYYY-MM-DD" local day, defaults to 2026-07-14. */
  day?: string;
  /** "HH:MM:SS", defaults to 12:00:00. */
  time?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  people?: string[];
  /** width / height, defaults to 1.5 (landscape 3:2). */
  ratio?: number;
  description?: string | null;
  localDateTime?: string;
}

function testPerson(name: string): PersonResponseDto {
  return {
    birthDate: null,
    id: `person-${name}`,
    isHidden: false,
    name,
    otherPeople: [],
    sharedBy: [],
    sharedWith: [],
    thumbnailPath: "",
  };
}

export function testAsset(options: TestAssetOptions = {}): AssetResponseDto {
  sequence += 1;
  const id = options.id ?? `asset-${sequence}`;
  const day = options.day ?? "2026-07-14";
  const time = options.time ?? "12:00:00";
  const iso = `${day}T${time}.000Z`;
  const width = Math.round(1000 * (options.ratio ?? 1.5));

  return {
    checksum: id,
    createdAt: iso,
    duration: null,
    exifInfo: {
      city: options.city ?? null,
      state: options.state ?? null,
      country: options.country ?? null,
      description: options.description ?? null,
      exifImageWidth: width,
      exifImageHeight: 1000,
      orientation: null,
    },
    fileCreatedAt: iso,
    fileModifiedAt: iso,
    hasMetadata: true,
    height: 1000,
    id,
    isArchived: false,
    isEdited: false,
    isFavorite: false,
    isOffline: false,
    isTrashed: false,
    localDateTime: options.localDateTime ?? iso,
    originalFileName: `${id}.jpg`,
    originalMimeType: "image/jpeg",
    originalPath: `/photos/${id}.jpg`,
    ownerId: "test-owner",
    people: (options.people ?? []).map(testPerson),
    thumbhash: null,
    type: "IMAGE" as AssetTypeEnum,
    updatedAt: iso,
    visibility: "timeline" as AssetVisibility,
    width,
  };
}
