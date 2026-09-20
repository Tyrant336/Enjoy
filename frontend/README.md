# enjoy — frontend

Next.js 16 + React 19 + react-three-fiber frontend for **enjoy** (the calm ocean
world that automates studying).

**Read first:** `../AGENTS.md` (code rules) → `../docs/REQUIREMENTS.md` (v2.1,
product truth) → `../docs/BUILDING.md` (who builds what) → `AGENTS.md` (this
folder — Next 16 has breaking changes vs training data; bundled docs live in
`node_modules/next/dist/docs/`).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # must stay green
```

Backend is expected at `http://localhost:8000` (`NEXT_PUBLIC_API_URL`, direct
connection + CORS — never proxy SSE through Next rewrites).

## Test

```bash
npx tsc --noEmit
npm run build
npm run lint
./node_modules/.bin/vitest run --config components/ui/__tests__/vitest.config.ts
```

⚠️ The vitest harness (vitest, vite, @vitejs/plugin-react, @testing-library/*,
jsdom) and the QA-only puppeteer-core are installed with
`npm i --no-save --no-package-lock --legacy-peer-deps` (package.json stays
untouched). **Every `--no-save` install PRUNES the previous ones** — always
install the whole set in ONE command:
`npm i --no-save --no-package-lock --legacy-peer-deps vitest vite @vitejs/plugin-react @testing-library/react @testing-library/dom jsdom puppeteer-core`.
QA screenshot/upload harnesses live in the gitignored `../.labshots/`.

## Feature wiring (session 030)

- **Upload**: the 📎 in `ChatPanel` — one-time §7.3 OpenRouter consent, client
  validation (`.pdf .pptx .docx .md .txt`, ≤25 MB), then the SAME file to
  `POST /agents/flashcards/generate` AND `POST /agents/kg/build`; staged calm
  loading; the boat arrives via the SSE `spawn_boat` path.
- **Preferences**: `ViewPanel`'s 🏷 Labels and 🐢 Calm-motion toggles persist
  via `PUT /api/preferences`; failures keep local state + soft-amber banner.
  Reduced motion is sticky-ON across world-state rebuilds (OS preference wins
  over a stored server `false`).
- **Atlas**: `AtlasLayer` fetches `GET /agents/kg/graph` live (fixture only
  remains for tests) and refetches on the worldBus's world-state resync.
- **Anki export**: a docked deck with `apkgUrl` shows a "↓ Anki deck" link
  pill (new tab; hidden when null).
- **Journal (FR-4.3)**: the lamp's "Journal" pill opens `JournalSheet` — the
  timeline of past victories from the canonical world-state projection.
- **Tour**: step narrations stream into the chat transcript (FR-5.5) and the
  chrome clears on NATURAL completion — both via host-handler intents
  (`onTourNarrate` / `onTourFinished`); the world never touches uiStore.
- **Per-topic atlas**: one cluster per subject/deck; the legend chips toggle
  each topic on/off underwater (Chinese, Math, … each upload adds its own).

## Structure (ownership zones — BUILDING.md §2)

- `components/world/`, `components/underwater/`, `lib/atlas/`, `lib/theme.ts`,
  `lib/worldApi.ts`, `public/` → **T hat** (3D world)
- `components/ui/`, `lib/worldBus.ts` → **L hat** (logic/wiring)
  - DOM chrome follows the **calm cream chrome language** (session 023):
    `ChromeButton` is the one shared button, `ViewPanel` the top-right view
    controls, `HintLine` the bottom-left hint; tokens in `lib/theme.ts`
    (`PALETTE.chrome*`, `CHROME`).
- `lib/types.ts` → **FROZEN contract** (mirror of `Backend/app/schemas.py`; edits
  via monitor only)
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css` → **monitor only**
- `public/models/` → the 3 locked GLBs (fishboat, lamp-buoy, smallboat)
