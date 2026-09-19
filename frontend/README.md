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

## Structure (ownership zones — BUILDING.md §2)

- `components/world/`, `components/underwater/`, `lib/atlas/`, `lib/theme.ts`,
  `lib/worldApi.ts`, `public/` → **T hat** (3D world)
- `components/ui/`, `lib/worldBus.ts` → **L hat** (logic/wiring)
- `lib/types.ts` → **FROZEN contract** (mirror of `Backend/app/schemas.py`; edits
  via monitor only)
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css` → **monitor only**
- `public/models/` → the 3 locked GLBs (fishboat, lamp-buoy, smallboat)
