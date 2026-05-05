# Supabase Transition Inventory

This file catalogs Turso/SQLite-specific behavior that must be handled for a full Supabase migration.

## High complexity (SQL semantics / transactions)

- `apps/api/src/db.ts`
  - Uses `@libsql/client` and `transaction("write")`.
  - Global query helpers assume SQLite/LibSQL parameter + transaction behavior.
- `apps/api/src/routes/breaks.ts`
  - Heavy transactional logic and multiple `datetime('now')` updates.
  - Uses SQLite scalar `max(...)` in SQL expressions.
- `apps/api/src/routes/streams.ts`
  - Stream lifecycle and item writes use SQLite timestamp functions.
- `apps/api/src/routes/admin.ts`
  - Many dynamic `IN (?, ?, ...)` queries and `date(...)` filters.
  - Extensive `datetime('now')` updates and schedule workflows.

## Medium complexity (query/function compatibility)

- `apps/api/src/routes/dashboard.ts`
  - Uses `ifnull(...)`.
- `apps/api/src/routes/auth.ts`
  - Uses app JWT today; must support Supabase JWT verification during hybrid auth.
- `scripts/import-localstorage.mjs`
  - Uses LibSQL client and `?` placeholders.

## Migration/schema compatibility (SQLite -> Postgres)

- `turso/migrations/*.sql`
  - SQLite functions and defaults (`randomblob`, `hex`, `datetime('now')`).
  - `PRAGMA foreign_keys`, `INSERT OR IGNORE`, trigger syntax, `GLOB`, `instr`, `substr`.
  - Table rebuild patterns and partial index semantics must be checked.

## Frontend/auth/storage/realtime touchpoints

- `apps/web/src/state/auth.tsx` and `apps/web/src/lib/api.ts`
  - Uses local token storage and app JWT flows.
- `apps/web/src/lib/supabase.js`
  - Supabase client stub exists; no active integration.
- `apps/web/src/pages/PayrollPage.tsx`
  - Payroll CSV import currently metadata-only; candidate for Supabase Storage upload.
- `apps/web/src/pages/StreamsPage.tsx`
  - React Query invalidation-only flow; candidate for Supabase Realtime subscriptions.
