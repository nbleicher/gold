# Deployment Guide

## Turso

1. Create Turso database and auth token.
2. Apply SQL migrations in `turso/migrations`:
   - `001_init.sql`
   - `002_seed_admin_template.sql` (after replacing placeholders)

## Railway (API + Spot Job)

1. Create Railway service from repo root.
2. Set service root/build context to repository root.
3. Set start command:
   - `npm --workspace @gold/api run start`
4. Configure env vars:
   - `PORT`
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `JWT_SECRET`
   - `CORS_ORIGIN`
   - `SPOT_PRIMARY_FEED_URL`
   - `SPOT_FALLBACK_FEED_URL`
5. Add cron service/job:
   - command: `npm --workspace @gold/api run job:spot`
   - schedule: every 30 seconds or 1 minute.

## Cloudflare Pages (Web)

1. Create Pages project from this repo.
2. Set root directory: `apps/web`
3. Build command: `npm install && npm --workspace @gold/web run build`
4. Build output: `apps/web/dist`
5. Environment variables:
   - `VITE_API_BASE_URL` = Railway API URL
6. Custom domain:
   - attach `gold.jawnix.com` to the Pages project.

## CORS

- Set API `CORS_ORIGIN` to `https://gold.jawnix.com` in production.
- For preview branches, include preview domains or use strict wildcard strategy with care.
