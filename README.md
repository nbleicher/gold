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
- [ ] Export localStorage from legacy app into `legacy-export.json`.
- [ ] Run `npm run import:legacy -- ./legacy-export.json`.
- [ ] Validate reconciliation counts in script output.

## Observability baseline

- API exposes `GET /health`.
- Fastify request logs enabled.
- Railway healthcheck configured in `railway.toml`.
- Spot ingestion job logs each successful ingestion.
