/**
 * Test fixtures: minimal Immich asset objects with just enough EXIF/people
 * data for grouping, layout and caption logic. Cast to AssetResponseDto so
 * tests stay readable without filling every API field.
 */
import type { AssetResponseDto } from "@immich/sdk";

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
  localDateTime?: string | null;
}

export function testAsset(options: TestAssetOptions = {}): AssetResponseDto {
  sequence += 1;
  const id = options.id ?? `asset-${sequence}`;
  const day = options.day ?? "2026-07-14";
  const time = options.time ?? "12:00:00";
  const iso = `${day}T${time}.000Z`;

  return {
    id,
    fileCreatedAt: iso,
    localDateTime:
      options.localDateTime === undefined ? iso : options.localDateTime,
    fileModifiedAt: iso,
    updatedAt: iso,
    originalFileName: `${id}.jpg`,
    originalPath: `/photos/${id}.jpg`,
    originalMimeType: "image/jpeg",
    deviceAssetId: id,
    deviceId: "test-device",
    ownerId: "test-owner",
    type: "IMAGE",
    visibility: "timeline",
    checksum: id,
    thumbhash: null,
    isFavorite: false,
    isArchived: false,
    isEdited: false,
    isOffline: false,
    isTrashed: false,
    hasMetadata: true,
    exifInfo: {
      city: options.city ?? null,
      state: options.state ?? null,
      country: options.country ?? null,
      description: options.description ?? null,
      exifImageWidth: Math.round(1000 * (options.ratio ?? 1.5)),
      exifImageHeight: 1000,
      orientation: null,
    },
    people: (options.people ?? []).map((name) => ({ id: `person-${name}`, name })),
  } as unknown as AssetResponseDto;
}
