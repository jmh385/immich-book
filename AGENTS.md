# AGENTS.md

Instructions for AI agents working in this repository.

## Commands

- `npm start` — Vite dev server (http://localhost:5173)
- `npm run build` — production build to `dist/`
- `npm run type-check` — `tsc --noEmit`; **the only automated check in this repo**
- There are **no tests, no lint, no formatter config** (README says so explicitly). Verification is `npm run type-check` plus manually exercising the app in a browser.
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
- Album contents come from the **paginated search API** (`searchAssets` with `albumIds` + `withExif`, `fetchAlbumAssets` in `PhotoGrid.tsx`), because the album endpoint no longer returns assets. `getAlbumInfo` is only metadata for deep links (`App.tsx`).
- `src/components/PhotoGrid.tsx` is deliberately large: it holds layout config UI, per-photo customizations, the HTML preview, **and** the PDF generation (`@react-pdf/renderer`). Expect all feature work to touch it. Note its inline PDF styles need `"flex" as const` etc. — literal unions in `@react-pdf` typings widen otherwise.
- `src/utils/pageLayout.ts` is the layout engine: page geometry is computed in **300 DPI pixel units** (`mmToPixels`) and converted to 72 DPI points for PDF output. Page sizes (A4/Letter/A3/custom) live in `PAGE_SIZES` there.

## State & persistence

- No server/backend state; everything persists in `localStorage`: `immich-config` (server URL + key), `immich-book-global-config`, and `immich-book-config-<albumId>` (per-album overrides).
- `?reset=true` in the URL clears all localStorage and reloads — use this when testing config changes.
- Routing is hash-based: `#/albums/<albumId>` (parsed in `App.tsx` via `hashchange`; no navigation library).
