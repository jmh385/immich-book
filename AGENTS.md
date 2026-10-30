# AGENTS.md

Instructions for AI agents working in this repository. Task goals live in
[TASKS.md](TASKS.md).

## Agent constraints (strict)

Solutions to certain matters are already existing which we have not yet been able to explore. Keep to the following rules unless explicitly told otherwise:

- Commands: run `npm start`, `npm install`, or `npm run build` only for implementing tasks.
- Do **not** verify by inspecting rendered `dist/` HTML output.
- Tests must be written with **Jest** (`npm test`); do not use Cypress or Playwright.
- Online (Google/web) searches are for research purposes only, not verification.
- Install packages only when they save a significant amount of work.

## Git discipline (strict)

- Use `git` for read-only operations only (status, log, diff, show, etc.).
  Never stage, commit, move, or delete anything — the user commits themselves.

## Work documentation

- Append to [work.md](work.md) after every change set that **would have been a
  commit** (what changed, why, open risks), so the user can review and sync it
  into real commits.

## Work process

- **Plan before doing it**: before starting a task, write down what will change
  (approach, files, order, risks) at the top of the relevant section in
  `work.md` or directly in its task entry. Make the plan in the working notes,
  not a chat-only decision — then execute.
- **Approval is not required**: plans are documented, not awaited. Check with
  the user only when a decision is genuinely open (e.g. scope in TASKS.md),
  not for routine execution.

## Commands

- `npm start` — Vite dev server (http://localhost:5173)
- `npm run build` — production build to `dist/`
- `npm run type-check` — `tsc --noEmit`; automated checks are `npm test` + this. Whatever an agent may run is restricted by [Agent constraints](#agent-constraints-strict).
- `npm test` — Jest (ts-jest, node env, `jest.config.cjs`). Tests live in `src/utils/__tests__/`; the wasm justified-layout is replaced by `__mocks__/@immich/justified-layout-wasm.ts`, so layout tests are deterministic. `npm test -- exampleBook` regenerates `example/immich-book-example.pdf` + `example/example-summary.json` (no Immich server needed). Do not import `@react-pdf/renderer` in tests — it is ESM-only; the example uses `src/utils/examplePdf.ts` instead.
- There is **no lint or formatter config**. Verification during implementation is limited to the commands allowed above plus manually exercising the app in a browser.
- Prettier and a TypeScript language server are provided via the Nix dev shell (`flake.nix`, auto-loaded by direnv via `.envrc`); no prettier config exists, so match the existing code style manually.

## Dev environment quirk

- Dev requests go to `/api` on the dev server and are **proxied to a real Immich server** to bypass CORS. Create a `.env` (see `.env.example`) with `VITE_IMMICH_PROXY_TARGET=https://your-immich-server.com` or the proxy defaults to `localhost:3000` and everything fails.

## Deployment (GitHub Pages)

- Deploys to `ch1bo.github.io/immich-book` on push to `master` (`.github/workflows/deploy.yml`). No PR CI, no test/lint CI.
- Pages build requires `VITE_BASE_PATH=/immich-book/`; a plain local `npm run build` uses base `/`.
- Build also injects `VITE_DEMO_API_KEY` (fetched from the public `demo.immich.app` instance via `.github/workflows/get-demo-api-key.mjs`). The demo key expires quickly, which is why CI also runs on a 4-hour cron to refresh it.

## Docker

- `Dockerfile` (multi-stage node build → nginx) + `docker-compose.yml` + `docker/nginx.conf.template` + `docker/30-immich-book-config.sh` (see upstream PR #9). `IMMICH_URL` env makes the container proxy `/api` to Immich, avoiding CORS; `BASE_PATH` is a **build arg** (baked into asset URLs), not an env var.
- Runtime config lives in `public/config.js` → `window.__IMMICH_BOOK_CONFIG__` (read via `src/config.ts` `getProxyTarget()`), which the container rewrites on start. Runtime config wins over build-time `VITE_IMMICH_PROXY_TARGET`.

## Architecture

- Pure client-side React 18 SPA (no backend, no router lib). Entry flow: `src/App.tsx` → `ConnectionForm` → `AlbumSelector` → `PhotoGrid`.
- Auth is API-key based via `@immich/sdk` **v3.x** — `init({ baseUrl, apiKey })`.
- Album contents come from the **paginated search API** (`searchAssets` with `albumIds` + `withExif` + `withPeople`, `fetchAlbumAssets` in `PhotoGrid.tsx`), because the album endpoint no longer returns assets. `getAlbumInfo` is only metadata for deep links (`App.tsx`).
- `src/components/PhotoGrid.tsx` is deliberately large: it holds layout config UI, per-photo customizations, the HTML preview, **and** the PDF generation (`@react-pdf/renderer`). Expect all feature work to touch it. Note its inline PDF styles need `"flex" as const` etc. — literal unions in `@react-pdf` typings widen otherwise.
- `src/utils/pageLayout.ts` is the layout engine: page geometry is computed in **300 DPI pixel units** (`mmToPixels`) and converted to 72 DPI points for PDF output. Page sizes (A4/Letter/A3/custom) live in `PAGE_SIZES` there. It also owns automatic grouping output: `groupBoundaries` (page break per group), `segmentStyles` (`justified` / `mixed` / `spotlight`), and `groupLabels` (caption on a group's first page; `groupLabelRight` in combined mode).
- `src/utils/book.ts` (`buildBookLayout`) is the grouping pipeline: `groupAssets` (`photoGrouping.ts`) splits contiguous runs by date/location/people (auto criteria via `pickAutoCriteria`), `autoLayoutStyleFor` picks a style per group (1 → spotlight, ≤3 → mixed, else justified), and `formatGroupLabel` (`groupLabel.ts`) generates the caption; manual overrides are keyed by group first-asset id. PhotoGrid and the Jest example both call it, so preview and PDF match.
- `src/utils/examplePdf.ts` is a dependency-free PDF writer used only by the example test (rectangles + captions), not part of the app bundle.

## State & persistence

- No server/backend state; everything persists in `localStorage`: `immich-config` (server URL + key), `immich-book-global-config`, and `immich-book-config-<albumId>` (per-album overrides).
- `?reset=true` in the URL clears all localStorage and reloads — use this when testing config changes.
- Routing is hash-based: `#/albums/<albumId>` (parsed in `App.tsx` via `hashchange`; no navigation library).
