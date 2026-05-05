# Gold Platform (React + Railway + Supabase)

This repository migrates the legacy static `goldstream-app.html` app to:

- React frontend on Cloudflare Pages (`apps/web`)
- Node API on Railway (`apps/api`)
- Supabase Postgres + hybrid auth transition (`supabase/migrations`)

## Workspace structure

- `apps/web`: Vite + React + React Query + API-backed auth
- `apps/api`: Fastify API for inventory/orders/streams/spot
- `packages/shared`: shared runtime schemas/types
- `supabase/migrations`: Postgres schema for Supabase
- `turso/migrations`: legacy Turso schema (kept for migration reference)
- `scripts/import-localstorage.mjs`: one-time legacy data import

## Quick start

1. Install dependencies:
   - `npm install`
2. Create `.env` from `.env.example`.
3. Apply Supabase migrations:
   - run SQL files in `supabase/migrations` (or `supabase db push`).
4. Start API:
   - `npm run dev:api`
5. Start web:
   - `npm run dev:web`

## Transition checklist

- [ ] Run Turso export: `npm run migrate:turso:export -- ./turso-export.json`
- [ ] Apply Supabase schema from `supabase/migrations`.
- [ ] Import into Supabase: `npm run migrate:turso:import -- ./turso-export.json`
- [ ] Reconcile counts: `npm run migrate:turso:reconcile`
- [ ] Keep legacy JWT + Supabase JWT enabled during hybrid login window.

## Spot prices (production)

- `GET /v1/spot/latest` reads `spot_snapshots` in Supabase Postgres.

**Recommended (push, vc-dash style):** On the VPS, run [`spot_scraper.py`](spot_scraper.py) on a schedule with **`GOLD_API_BASE_URL`** (your Railway API origin) and **`SPOT_PUSH_SECRET`**. On Railway, set **`SPOT_PUSH_SECRET`** to the same value. Each run POSTs to **`POST /v1/spot/push`** and inserts rows; no public `spot-feed.json` required for the dashboard.

**Fallback (pull ingest):** **`npm --workspace @gold/api run job:spot`** ([`apps/api/src/jobs/spotIngest.ts`](apps/api/src/jobs/spotIngest.ts)) fetches **`SPOT_PRIMARY_FEED_URL`** and inserts. Use if you still host a public JSON file (e.g. keep `--out` on the scraper for nginx).

- Set **`SPOT_FALLBACK_FEED_URL`** (see [`apps/api/src/env.ts`](apps/api/src/env.ts)) for the ingest job when the primary URL fails.
- Details: [docs/deployment.md](docs/deployment.md).

## Observability baseline

- API exposes `GET /health`.
- Fastify request logs enabled.
- Railway healthcheck configured in `railway.toml`.
- Spot ingestion job logs each successful ingestion.
