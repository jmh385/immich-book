# TASKS.md

Task list for this fork. Every change made here is for specific needs that
upstream `ch1bo/immich-book` does not serve yet. Follow the agent constraints in
[AGENTS.md](AGENTS.md) — in particular: Jest for tests, and no verification by
inspecting rendered HTML output.

Keep this file current: new goals go on top, completed items move to
"Done" with a short note on how they were done.

## Open

### Follow-ups from completed goals

- [ ] GPS clustering for photos without EXIF city/state/country (grouping uses
      city → state → country only, no coordinate clustering).
- [ ] Alternating row-based alignments (former candidate 3): per-page
      left/center/right alignment exists, but rows are not alternated
      automatically.
- [ ] A single "reset all caption overrides" control; clearing an individual
      caption input already restores the generated text.
- [ ] Consider reusing the description/date renderer for group captions instead
      of the dedicated bottom-margin strip. They already share the `fontSize`
      setting and the layout engine, and do not collide because descriptions
      stay inside photo boxes.

## Done

### 1. Additional layout options, applied automatically — done

- Added `LayoutStyle = "justified" | "mixed" | "spotlight"` to
  `src/utils/pageLayout.ts`. Each group gets a style automatically from
  `autoLayoutStyleFor` (1 photo → spotlight, ≤3 → mixed, else justified), or a
  fixed style can be chosen per album.
- `mixed` = one full-width photo above justified rows (height capped at half
  the content area); `spotlight` = one photo filling the page.
- Preview and PDF match because grouping, styles and captions are resolved once
  in `src/utils/book.ts` (`buildBookLayout`) before either renderer runs.

### 2. Automatic grouping of photos into pages — done

- `src/utils/photoGrouping.ts` splits the asset stream into contiguous runs by
  date/location/people, applied hierarchically (e.g. location runs, then days
  within them); `pickAutoCriteria` chooses criteria from the data. Explicit
  modes (day/location/person) and "off" are available per album.
- `fetchAlbumAssets` now requests `withPeople` in addition to `withExif`.
- Groups force page breaks (`groupBoundaries`); a group only spans several
  pages when it does not fit. The preview shows the resulting pages and
  captions before PDF generation.
- Manual drag & drop reordering still runs on the filtered asset stream before
  grouping, so it keeps working (and can change group boundaries).

### 3. Auto-generated text for automatic groupings — done

- `src/utils/groupLabel.ts` formats "Location, date range, with people" from
  group facts; wording is generated once in `buildBookLayout` and reused by the
  preview and the PDF.
- Captions render in the bottom margin strip (`Page.groupLabel` /
  `groupLabelRight`), so they never collide with `exifInfo.description`
  captions inside photo boxes; both honor the existing `fontSize` setting.
- Per-group overrides are editable in the preview ("Edit group captions") and
  persisted per album; a blank input restores the generated text.

## Backlog notes

- Upstream PR #9 (Docker + album asset fix) is already applied in this fork; do
  not re-apply it.
- `pageAlignments` (per-page left/center/right) and `fontSize` (recent commits
  `Row-based alignment`, `Customizable font size`) are the newest features —
  tasks 1–3 build on them without regressing them.
- Tests: `npm test` (Jest). `npm test -- exampleBook` regenerates the runnable
  example in `example/` without an Immich server.
- `tsconfig.json` includes `src` and `__mocks__`; `strict` + `noImplicitAny` are
  on. Do not introduce `any`; prefer precise interfaces or `unknown` + narrowing.

### 4. Individually editable text boxes — done

- Shared `TextBox` model in `src/utils/textBoxes.ts`, rendered by both preview
  and PDF after photos (fixes text-under-image stacking).
- Per-box overrides (text, x, y, width, font family, size, colour, alignment,
  hidden) keyed by `kind:assetId`, persisted per album; click a box in the
  preview to edit it, drag to move.
- Defaults reproduce the previous date/description/caption output.

### 5. Richer page layouts with per-page control — done

- `src/utils/layoutPresets.ts` defines 10 preset grids; `pageLayout.ts`
  paginates preset pages alongside the existing justified engine.
- Per-page override selector in the preview, keyed by the page's first asset id,
  persisted per album ("Auto" + presets).

### 6. Bug: text hidden under images — done

- Text boxes are drawn after photos in both renderers with explicit z-index;
  captions now live in the reserved margin strip as text boxes.

### 7. Per-page background customization — done

- `src/utils/backgrounds.ts` models colour / gradient (PowerPoint-like presets)
  / photo backgrounds with preview CSS, PDF SVG gradients and full-page images,
  plus a contrast helper.
- Album default plus per-page overrides, keyed by the page's first asset id.
