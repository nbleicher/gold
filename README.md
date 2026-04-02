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
   - run SQL files in `turso/migrations` in order.
4. Start API:
   - `npm run dev:api`
5. Start web:
   - `npm run dev:web`

## Migration checklist

- [ ] Insert first admin user (bcrypt hash) using `turso/migrations/002_seed_admin_template.sql`.
- [ ] Apply `turso/migrations/003_bag_orders_sold_at.sql` on **production** Turso (`bag_orders.sold_at`). Without it, admin stream delete and sticker flows can fail with SQL errors.
- [ ] Export localStorage from legacy app into `legacy-export.json`.
- [ ] Run `npm run import:legacy -- ./legacy-export.json`.
- [ ] Validate reconciliation counts in script output.

## Spot prices (production)

- `GET /v1/spot/latest` reads `spot_snapshots`. Rows are populated by **`npm --workspace @gold/api run job:spot`** ([`apps/api/src/jobs/spotIngest.ts`](apps/api/src/jobs/spotIngest.ts)).
- Set **`SPOT_PRIMARY_FEED_URL`** and **`SPOT_FALLBACK_FEED_URL`** (see [`apps/api/src/env.ts`](apps/api/src/env.ts)) plus the same Turso env vars as the API.
- On **Railway**, add a **Cron** or recurring service that runs `npm --workspace @gold/api run job:spot` on an interval (e.g. every 5–15 minutes). Without this, the Home dashboard shows “No data yet” for spot until snapshots exist.

## Observability baseline

- API exposes `GET /health`.
- Fastify request logs enabled.
- Railway healthcheck configured in `railway.toml`.
- Spot ingestion job logs each successful ingestion.
