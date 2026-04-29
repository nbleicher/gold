# Gold Platform (React + Railway + Turso)

This repository migrates the legacy static `goldstream-app.html` app to:

- React frontend on Cloudflare Pages (`apps/web`)
- Node API on Railway (`apps/api`)
- Turso (LibSQL) + custom JWT auth (`turso/migrations`)

## Workspace structure

- `apps/web`: Vite + React + React Query + API-backed auth
- `apps/api`: Fastify API for inventory/orders/streams/spot
- `packages/shared`: shared runtime schemas/types
- `turso/migrations`: SQL schema and seed templates
- `scripts/import-localstorage.mjs`: one-time legacy data import

## Quick start

1. Install dependencies:
   - `npm install`
2. Create `.env` from `.env.example`.
3. Apply Turso migrations:
   - run SQL files in `turso/migrations` **in numeric order** through the latest. For breaks/streams run **`013_break_multi_run.sql`** after **`012`** (see file header: it drops and recreates all break tables).
4. Start API:
   - `npm run dev:api`
5. Start web:
   - `npm run dev:web`

## Migration checklist

- [ ] Insert first admin user (bcrypt hash) using `turso/migrations/002_seed_admin_template.sql`.
- [ ] Apply `turso/migrations/003_bag_orders_sold_at.sql` on **production** Turso (`bag_orders.sold_at`). Without it, admin stream delete and sticker flows can fail with SQL errors.
- [ ] Apply `turso/migrations/013_break_multi_run.sql` on **production** Turso after **`012`** (replaces break tables; see script header). Required for current breaks/stream APIs.
- [ ] Export localStorage from legacy app into `legacy-export.json`.
- [ ] Run `npm run import:legacy -- ./legacy-export.json`.
- [ ] Validate reconciliation counts in script output.

## Spot prices (production)

- `GET /v1/spot/latest` reads `spot_snapshots` in Turso.

**Recommended (push, vc-dash style):** On the VPS, run [`spot_scraper.py`](spot_scraper.py) on a schedule with **`GOLD_API_BASE_URL`** (your Railway API origin) and **`SPOT_PUSH_SECRET`**. On Railway, set **`SPOT_PUSH_SECRET`** to the same value. Each run POSTs to **`POST /v1/spot/push`** and inserts rows; no public `spot-feed.json` required for the dashboard.

**Fallback (pull ingest):** **`npm --workspace @gold/api run job:spot`** ([`apps/api/src/jobs/spotIngest.ts`](apps/api/src/jobs/spotIngest.ts)) fetches **`SPOT_PRIMARY_FEED_URL`** and inserts. Use if you still host a public JSON file (e.g. keep `--out` on the scraper for nginx).

- Set **`SPOT_FALLBACK_FEED_URL`** (see [`apps/api/src/env.ts`](apps/api/src/env.ts)) for the ingest job when the primary URL fails.
- Details: [docs/deployment.md](docs/deployment.md).

## Observability baseline

- API exposes `GET /health`.
- Fastify request logs enabled.
- Railway healthcheck configured in `railway.toml`.
- Spot ingestion job logs each successful ingestion.
