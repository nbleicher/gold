# Deployment Guide

## Supabase

1. Create project.
2. Apply SQL migrations in `supabase/migrations`:
   - `001_init.sql`
   - `002_profile_trigger.sql`
3. Create first auth user and set role:
   - `update public.profiles set role = 'admin' where id = '<auth-user-id>';`

## Railway (API + Spot Job)

1. Create Railway service from repo root.
2. Set service root/build context to repository root.
3. Set start command:
   - `npm --workspace @gold/api run start`
4. Configure env vars:
   - `PORT`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
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
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## CORS

- Set API `CORS_ORIGIN` to Cloudflare Pages URL in production.
- For preview branches, include preview domains or use strict wildcard strategy with care.
