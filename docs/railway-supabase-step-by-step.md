# Railway + Supabase Migration Guide (In-Depth)

This guide walks through a complete Turso -> Supabase migration for this project, with Railway deployment and practical troubleshooting.

## 0) Overview

You are migrating:

- Database: Turso (LibSQL/SQLite) -> Supabase Postgres
- Backend hosting: Railway (API)
- Frontend hosting: Cloudflare Pages (or equivalent)
- Auth/storage/realtime: Supabase-enabled flow

High-level sequence:

1. Prepare Supabase project (DB, Storage, Realtime)
2. Apply Supabase schema migrations
3. Export Turso data
4. Import to Supabase
5. Reconcile counts and fix mismatches
6. Set production env vars (Railway + web)
7. Cut over with brief write freeze
8. Validate and monitor

---

## 1) Prerequisites

From repo root, ensure dependencies are installed:

```bash
npm install
```

You need:

- Supabase project access (owner/admin)
- Turso DB URL + token
- Railway project access
- Ability to run SQL in Supabase SQL Editor

---

## 2) Create Supabase resources

In Supabase dashboard:

1. Create/select your project.
2. Create Storage bucket:
   - Name: `payroll-csv`
   - Public bucket: OFF (private)
3. Enable Realtime for:
   - `streams`
   - `stream_items`
   - `break_spots`

Recommended: keep RLS enabled and add policies before production use.

---

## 3) Get required Supabase values

Use these settings:

- `SUPABASE_URL`: project base URL  
  Example: `https://rsqhtzmngnztsadipvne.supabase.co`
- `SUPABASE_ANON_KEY`: from API settings
- `SUPABASE_SERVICE_ROLE_KEY`: from API settings
- `DATABASE_URL`: from Project Settings -> Database -> Connection string (URI)

Expected `DATABASE_URL` shape:

```text
postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

Notes:

- `https://.../rest/v1/` is the REST endpoint, not `DATABASE_URL`.
- If local TLS chain errors occur, temporarily use `sslmode=no-verify` for one-time import.

---

## 4) Configure local `.env`

Create/update project root `.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require
TURSO_DATABASE_URL=libsql://YOUR_DB.turso.io
TURSO_AUTH_TOKEN=YOUR_TURSO_AUTH_TOKEN
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Optional fallback if TLS chain fails locally:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=no-verify
```

---

## 5) Apply Supabase schema migrations

Apply SQL from `supabase/migrations` (CLI or SQL Editor).

At minimum:

- `supabase/migrations/20260505115000_initial.sql`
- `supabase/migrations/20260505115500_seed_pool.sql`

If you already ran imports and saw missing-column errors, patch schema parity first (see section 8).

---

## 6) Export from Turso

From repo root:

```bash
npm run migrate:turso:export -- ./turso-export.json
```

This generates `turso-export.json` with all migration-target tables.

---

## 7) Import into Supabase

Run:

```bash
npm run migrate:turso:import -- ./turso-export.json
```

Then reconcile:

```bash
npm run migrate:turso:reconcile
```

What to expect:

- Import logs per table, but only after each table finishes.
- Long pauses can happen on large tables because inserts are row-by-row.

Do not interrupt unless clearly stuck; transaction rollback can lose progress.

---

## 8) Common migration errors and exact fixes

### A) Missing env var

Error:

`Missing DATABASE_URL`

Fix:

- Set `DATABASE_URL` in shell or root `.env`.
- Re-run import.

### B) TLS error

Error:

`SELF_SIGNED_CERT_IN_CHAIN`

Fix (local one-time):

- Use `sslmode=no-verify` in `DATABASE_URL` for import.

### C) Missing column in target table

Example:

- `column "batch_number" of relation "inventory_batches" does not exist`
- `column "created_at" of relation "bag_order_components" does not exist`

Cause:

- Export rows include columns not present in Supabase schema.

Fix (run in Supabase SQL Editor):

```sql
alter table inventory_batches
  add column if not exists batch_number integer;

alter table bag_order_components
  add column if not exists created_at timestamptz default now();

alter table breaks
  add column if not exists sold_spots integer not null default 0;

alter table breaks
  add column if not exists cloned_from_id text references breaks(id) on delete set null;

alter table break_spots
  add column if not exists created_at timestamptz default now();

alter table spot_snapshots
  add column if not exists price double precision;

alter table spot_snapshots
  add column if not exists source_state text;
```

### D) NOT NULL mismatch in `spot_snapshots`

Error:

`null value in column "price_per_oz_usd" ... violates not-null constraint`

Cause:

- Turso rows use `price`, but schema expects `price_per_oz_usd`.

Fix sequence:

```sql
alter table spot_snapshots
  alter column price_per_oz_usd drop not null;

update spot_snapshots
set price_per_oz_usd = coalesce(price_per_oz_usd, price),
    source = coalesce(source, source_state, 'fallback');
```

After import is fully complete:

```sql
update spot_snapshots
set price_per_oz_usd = coalesce(price_per_oz_usd, price),
    source = coalesce(source, source_state, 'fallback');

alter table spot_snapshots
  alter column price_per_oz_usd set not null;
```

---

## 9) If import appears to freeze

Symptoms:

- You see output up to `Imported ... schedules`
- No new lines for a while

Likely:

- Script is still processing next large table.

Check activity in Supabase SQL Editor:

```sql
select pid, state, wait_event_type, wait_event, now() - query_start as running_for, query
from pg_stat_activity
where datname = 'postgres'
order by query_start desc;
```

If active inserts exist, let it run.

---

## 10) Railway production configuration

In Railway API service env vars, set:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `SPOT_PUSH_SECRET`
- `CORS_ORIGIN`
- `PORT`

During hybrid period, keep auth behavior compatible with both legacy and Supabase tokens.

For web deployment, set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

Redeploy after `VITE_*` changes.

---

## 11) Cutover runbook (brief freeze)

1. Announce maintenance window (5-15 min).
2. Freeze writes.
3. Final data sync:
   - export Turso
   - import into Supabase
   - reconcile
4. Switch production envs to Supabase values.
5. Deploy/restart API and web.
6. Unfreeze writes.

---

## 12) Post-cutover validation checklist

Run these checks immediately:

- Auth:
  - `/v1/auth/login` works
  - `/v1/auth/me` works
- Core flows:
  - inventory updates
  - streams start/end
  - break spot processing
  - payroll records + storage path
  - spot ingestion
- Realtime:
  - stream page updates without manual refresh

If critical failures persist beyond your rollback threshold, execute rollback quickly.

---

## 13) Rollback checklist

1. Re-enable write freeze.
2. Revert Railway envs to last known good config.
3. Redeploy previous stable release.
4. Unfreeze writes.
5. Communicate status and next action plan.

---

## 14) Recommended hardening after successful migration

- Tighten/verify RLS policies by role.
- Remove temporary compatibility columns after data normalization.
- Update importer to map legacy Turso column names to canonical Postgres names.
- Add smoke tests for auth, stream processing, payroll storage, and spot ingest.
