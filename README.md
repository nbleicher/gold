# Gold Platform (React + Railway + Supabase)

This repository migrates the legacy static `goldstream-app.html` app to:

- React frontend on Cloudflare Pages (`apps/web`)
- Node API on Railway (`apps/api`)
- Supabase Auth + Postgres + RLS (`supabase/migrations`)

## Workspace structure

- `apps/web`: Vite + React + React Query + Supabase client auth
- `apps/api`: Fastify API for inventory/orders/streams/spot
- `packages/shared`: shared runtime schemas/types
- `supabase/migrations`: SQL schema, constraints, RLS, profile trigger
- `scripts/import-localstorage.mjs`: one-time legacy data import

## Quick start

1. Install dependencies:
   - `npm install`
2. Create `.env` from `.env.example`.
3. Apply Supabase migrations:
   - run SQL files in `supabase/migrations` in order.
4. Start API:
   - `npm run dev:api`
5. Start web:
   - `npm run dev:web`

## Migration checklist

- [ ] Create first admin user in Supabase Auth.
- [ ] Update `profiles.role` to `admin` for that user.
- [ ] Export localStorage from legacy app into `legacy-export.json`.
- [ ] Run `npm run import:legacy -- ./legacy-export.json`.
- [ ] Validate reconciliation counts in script output.

## Observability baseline

- API exposes `GET /health`.
- Fastify request logs enabled.
- Railway healthcheck configured in `railway.toml`.
- Spot ingestion job logs each successful ingestion.
