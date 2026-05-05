# Supabase Cutover Runbook

## Pre-cutover (T-24h to T-1h)

1. Confirm `supabase/migrations` applied in production.
2. Run dry migration:
   - `npm run migrate:turso:export -- ./tmp/turso-export.json`
   - `npm run migrate:turso:import -- ./tmp/turso-export.json`
   - `npm run migrate:turso:reconcile`
3. Verify core flows in staging:
   - login, streams, breaks, inventory, payroll, spot ingestion.
4. Ensure rollback artifacts exist:
   - fresh Turso snapshot/export and previous Railway env snapshot.

## Cutover window (brief write freeze)

1. Enable maintenance mode (freeze writes) at API edge/load balancer.
2. Final sync:
   - `npm run migrate:turso:export -- ./tmp/turso-final.json`
   - `npm run migrate:turso:import -- ./tmp/turso-final.json`
   - `npm run migrate:turso:reconcile`
3. Switch production env:
   - set `DATABASE_URL` to Supabase Postgres
   - set Supabase env keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
4. Deploy/restart API and web.
5. Remove maintenance mode.

## Post-cutover verification (first 30 minutes)

1. Confirm API `/health` and web boot.
2. Verify `/v1/auth/me` succeeds with both legacy JWT and Supabase token.
3. Validate realtime stream updates in streamer UI.
4. Validate payroll CSV upload writes storage path.
5. Validate spot ingestion endpoint.

## Rollback criteria

Rollback if any of these fail for more than 10 minutes:
- logins consistently failing
- stream/break writes failing
- data mismatch in key reconciliation tables

Rollback steps:
1. Re-enable maintenance mode.
2. Restore previous Railway env (`DATABASE_URL` back to Turso-compatible branch if retained, or previous API release).
3. Redeploy previous known-good build.
4. Disable maintenance mode and communicate incident status.
