# work.md

Working log for this fork. Every entry is a change set that **would have been a
commit** — it documents what, why, and open risks so the user can review it and
make the real git commits. Git itself is only used read-only (see AGENTS.md,
"Git discipline"). Newest entry on top.

Format per entry:

- Timestamp and supporting reference (TASKS.md goal / upstream PR, if any)
- Plan (what was intended — note: the plan is recorded before execution;
  approval is not required)
- What changed (files, grouped by purpose)
- Verification and its limits (per AGENTS.md constraints)
- Risks / follow-up

---

## Entry 2 — Implement all TASKS.md goals: auto layout options, automatic grouping, auto text

**Reference:** TASKS.md goals 1–3

### Plan (recorded before execution; approval not required)

Design principle: `pageLayout.ts` stays the single source of truth used by both
the HTML preview and the PDF, so grouping, layout styles and auto captions are
computed once there and renderers only draw boxes/strings. Pure logic lives in
new `src/utils` modules so it is testable with Jest in Node (no browser), with
a deterministic mock of the wasm justified-layout for reproducible tests.

1. New module `src/utils/photoGrouping.ts` (pure, no SDK imports):
   `GroupCriterion = "date" | "location" | "person"`; `groupAssets(assets,
   criteria)` splits the (chronologically sorted, possibly manually reordered)
   asset sequence into contiguous groups by runs of the criteria, applied
   hierarchically in list order (e.g. location runs, then days within them).
   `pickAutoCriteria(assets)` heuristic picks the criteria; `autoLayoutStyleFor`
   maps group size to a layout style (1 → spotlight, ≤3 → mixed, else
   justified).
2. New module `src/utils/groupLabel.ts`: `formatGroupLabel({ location,
   startDate, endDate, people })` → e.g. "Madeira, 14–21 July 2026, with Alice
   & Bob" (Intl-based month names, locale injectable for deterministic tests).
3. Extend `src/utils/pageLayout.ts` (keep existing behavior intact for albums
   that don't set the new fields): new `LayoutStyle = "justified" | "mixed" |
   "spotlight"`; `LayoutOptions` gains `groupBoundaries` (asset indices that
   force a page break), `segmentStyles` (style per group with fresh geometry
   per segment), `groupLabels` (label of each group shown on its first page);
   `Page` gains `groupLabel` and `groupLabelRight` (combined-pages mode).
   - justified: as today, wasm run per segment
   - spotlight: one photo per page filling the content area
   - mixed: first photo full content width (height capped to keep half the
     page or its aspect), remaining photos in justified rows below
   - existing page alignments + combinePages unchanged, labels carried over
4. PhotoGrid integration:
   - `fetchAlbumAssets` adds `withPeople: true` (person data comes with the
     search API in SDK 3 → no extra requests)
   - new config fields persisted per album + global: `groupingMode`
     ("auto"|"off"|"day"|"location"|"person", default "auto"), `layoutStyle`
     ("auto"|"justified"|"mixed"|"spotlight", default "auto"), `showGroupLabels`
     (default true)
   - UI: Grouping select + Captions checkbox (Presentation row), Style select
     (Layout row)
   - `pages` memo becomes: group (unless off) → per-group auto styles (if
     "auto") → labels (if `showGroupLabels`) → `calculatePageLayout`
   - render `page.groupLabel`/`groupLabelRight` at the bottom margin strip,
     shared strings for preview and PDF
5. Jest setup: install `jest`, `ts-jest`, `@types/jest` (these save significant
   work: they are the required test runner per agent constraints);
   `jest.config.js` (ts-jest, node env), `npm test` script, manual mock
   `__mocks__/@immich/justified-layout-wasm.ts` (deterministic row packing)
   since wasm/ESM doesn't load under Node.
6. Tests (Jest only, no browser output): groupLabel formatting, photoGrouping
   (criteria runs, hierarchy, auto-selection, order stability, manual reorder
   respect), pageLayout segments/labels/auto styles/combine/alignment, and an
   `exampleBook.test.ts` that writes an **example PDF with placeholder
   rectangles (no Immich, no network)** plus `example/example-summary.json` to
   `example/`, demonstrating all three goals on mock data.

### Result

Implemented as planned, with four deviations noted at the end.

**New pure modules**

- `src/utils/photoGrouping.ts` — `GroupCriterion` (`date`/`location`/`person`),
  `groupAssets()` splits contiguous runs hierarchically, `pickAutoCriteria()`
  (locations → location+date, multi-day with people → date+person, multi-day →
  date, single day with people → person), `autoLayoutStyleFor()` (1 →
  spotlight, ≤3 → mixed, else justified), and the asset fact helpers
  (`assetLocalDay`, `assetLocation`, `assetPeople`). No SDK import, so it runs
  in Node/Jest.
- `src/utils/groupLabel.ts` — `formatDateRange()` + `formatGroupLabel()`
  ("Funchal, 14 July 2026, with Alice & Bob", en dash ranges across
  days/months/years, Intl month names, locale injectable).
- `src/utils/book.ts` — `buildBookLayout()`: grouping mode → criteria → groups →
  per-group style → captions (generated or per-group override) → group
  boundaries → `calculatePageLayout()`. Returns `{ pages, groups, styles,
  labels }`. `criteriaForMode()` maps `"day"` to the `"date"` criterion.
- `src/utils/examplePdf.ts` — dependency-free PDF writer for the example only.

**Layout engine (`src/utils/pageLayout.ts`)**

- `LayoutStyle` + `LayoutOptions.groupBoundaries` / `segmentStyles` /
  `groupLabels`, `Page.groupLabel` / `groupLabelRight`.
- Each group is laid out independently and starts on a new page; justified
  rows, mixed (full-width first photo, half-content-height cap, rows below) and
  spotlight (one photo per page, filling the content area).
- Existing pagination, per-page alignment and `combinePages` behavior kept;
  labels move to the matching half in combined mode.

**App integration (`src/components/PhotoGrid.tsx`)**

- `fetchAlbumAssets` requests `withPeople: true` next to `withExif`.
- New persisted config fields (album + global fallback): `groupingMode`
  (default `auto`), `layoutStyle` (default `auto`), `showGroupLabels`
  (default on), plus album-only `groupLabelOverrides`.
- UI: Style select (Layout row), Grouping select + "Group Captions" checkbox
  (Presentation row), group/style summary line, and a collapsible "Edit group
  captions" list of per-group inputs (blank = generated text).
- The page memo now calls `buildBookLayout`; preview and PDF both draw
  `page.groupLabel` / `groupLabelRight` in the bottom margin strip, so both
  renderers use the same boxes and strings.

**Jest setup and tests**

- `package.json` / lock: `jest`, `ts-jest`, `@types/jest`; `npm test` script.
- `jest.config.cjs` (CommonJS because the package is `"type": "module"`),
  node env, ts-jest, `src/**/*.test.{ts,tsx}`.
- `__mocks__/@immich/justified-layout-wasm.ts` — deterministic row packer so
  layout assertions are exact and offline.
- `src/utils/__tests__/testAssets.ts` fixture; suites for `groupLabel`,
  `photoGrouping`, `pageLayout`, `book` and `exampleBook` (53 tests).
- `example/README.md` + `exampleBook.test.ts` writes
  `example/immich-book-example.pdf` (5 pages: mixed, mixed, spotlight, mixed,
  justified) and `example/example-summary.json` from 14 mock photos.

**Docs / repo**

- `TASKS.md` — goals 1–3 moved to Done with notes; remaining follow-ups listed
  under Open (GPS clustering, alternating row alignment, bulk override reset,
  optional renderer reuse).
- `AGENTS.md` — Jest/`npm test` instructions, wasm mock and example command,
  grouping pipeline architecture notes, `withPeople`.
- `.gitignore` — generated `example/*.pdf` and `example/*.json`.

### Verification

- `npm test`: 5 suites, 53 tests, all passing.
- `npm run type-check`: clean (the only error was an unused parameter in
  `exampleBook.test.ts`; note that `npm run build` is plain `vite build` and
  does **not** type-check).
- Per constraints, no rendered HTML/`dist/` inspection and no browser run; the
  example PDF is validated by assertions (`%PDF-` header, `%%EOF`, size) and by
  the JSON summary, not visually.

### Deviations from the plan

1. `jest.config.js` → `jest.config.cjs`: `"type": "module"` makes a `.js`
   config fail with `module is not defined`.
2. The example uses `src/utils/examplePdf.ts` instead of
   `@react-pdf/renderer`, which is ESM-only and cannot be loaded by Jest
   (`Must use import to load ES Module`). The app still uses `@react-pdf`.
3. Per-group caption overrides were added (planned only as generated text) to
   cover that goal-3 requirement; stored per album, keyed by group first-asset
   id.
4. `TASKS.md` candidate 3 ("alternating row-based alignments") was not added;
   the existing per-page alignment remains unchanged and is listed as a
   follow-up.

### Risks / follow-up

- Grouping uses contiguous runs over the (possibly manually reordered) stream;
  reordering can change group boundaries and orphan caption overrides keyed by
  a group's first asset id.
- `pickAutoCriteria` is a heuristic; location grouping has no GPS clustering
  and uses city → state → country, so albums without EXIF location fall back to
  dates/people.
- `withPeople` depends on the SDK 3 search API returning `people`; servers that
  omit it yield person-less groups (graceful fallback).
- Generated captions use the browser locale (tests pin `en-GB`); wording may
  differ per locale, but preview and PDF share the generated strings.
- `mixed` caps the large photo at half the content height; very tall groups may
  push rows to later pages (covered by tests only for typical ratios).

---

## Entry 1 — Retroactive documentation of session work, 2026-10-30


**Reference:** Upstream PR #9 `hardtmedia:docker-and-album-asset-fix`
(https://github.com/ch1bo/immich-book/pull/9), implemented before this file
existed and documented here retroactively.

### Plan 1a — AGENTS.md

Create an instruction file for future OpenCode sessions with high-signal,
repo-specific facts only.

### Result 1a

- `AGENTS.md` (new) — commands (`type-check` is the only automated check),
  dev-proxy`.env` requirement, GitHub Pages deploy details (`VITE_BASE_PATH`,
  `VITE_DEMO_API_KEY` 4-hour cron), architecture notes (SPA flow,
  `PhotoGrid.tsx` contains preview + PDF generation, 300 DPI geometry in
  `pageLayout.ts`), localStorage keys, hash routing, Docker notes, agent
  constraints (Jest only, allowed commands, work process).

### Plan 1b — Implement upstream PR #9 in this fork

Apply the whole PR: Docker deployment (image proxies `/api` so no CORS is
needed) and the album-asset fix (album endpoint no longer returns assets on
Immich 3.x), adapting to this fork's diverged code rather than blind-copying.

### Result 1b

- `Dockerfile` (new) — node 22 build stage → nginx; `BASE_PATH` build arg baked
  into asset URLs; healthcheck
- `.dockerignore` (new), `docker-compose.yml` (new) — starting-point compose
  with `IMMICH_URL` + optional external Immich network
- `docker/nginx.conf.template` (new), `docker/30-immich-book-config.sh` (new) —
  nginx site rendered on container start; `/api` proxied to `IMMICH_URL`;
  runtime config written to `dist/config.js`
- `public/config.js` (new) → `window.__IMMICH_BOOK_CONFIG__`; `src/config.ts`
  (new) with `getProxyTarget()` — runtime config wins over build-time
  `VITE_IMMICH_PROXY_TARGET`
- `index.html` — loads `/config.js`
- `src/components/ConnectionForm.tsx` — runtime proxy target, `/api` base
  relative to `BASE_URL` (sub-directory deploys work), security warning hidden
  when proxied
- `src/components/PhotoGrid.tsx` — `fetchAlbumAssets()` pages the search API
  (`searchAssets`, 1000/page, de-duped by id, `withExif: true`) instead of
  `getAlbumInfo().assets`
- `src/components/AlbumSelector.tsx` — `getAllAlbums({ shared })` →
  `{ isShared }`
- `README.md` — Docker section replaces "Coming Soon"
- `package.json` / `package-lock.json` — `@immich/sdk` 2.2.3 → ^3.1.0 (resolved
  3.3.5)

### Verification of entry 1

- `npm install` + `npm run type-check` pass; breakdown of errors confirmed the
  two `@react-pdf` style-literal failures at lines 1191/1232 were **pre-existing
  on HEAD** (verified in a temp worktree) and then fixed with
  `"flex" as const` / `"center" as const` in `PhotoGrid.tsx`
  (match to `createWebStyles` style already in file)
- `npm run build` (plain and `VITE_BASE_PATH=/book/`) — asset URLs and
  `config.js` correctly base-prefixed
- SDK 3.x: all imports used by app + CI demo-key script verified against
  `node_modules/@immich/sdk/build` (`.d.ts` scan); demo-key script authenticates
  against `demo.immich.app` with SDK 3 but fails with old SDK — so the bump
  also revives the GitHub Pages demo deploy

### Risks / follow-up from entry 1

- SDK 3.x targets Immich 3.x servers; if the user's server is 1.x/2.x the bump
  must be revisited
- `npm audit` reports 13 vulnerabilities (1 low, 2 moderate, 10 high) — left
  alone, out of PR scope
- `dist/` was left built in the working tree (gitignored) from verification

### Plan 1c — TASKS.md

Record the three main goals of this fork as a maintained task list.

### Result 1c

- `TASKS.md` (new) — 1. additional layout options applied automatically
  (scope of candidates still open), 2. automatic page grouping by
  location/person/date-time, 3. auto-generated text for groupings; plus "PR #9
  already applied" and "don't regress row-based alignment / font size" notes
