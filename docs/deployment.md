# Deployment Guide

## Turso

1. Create Turso database and auth token.
2. Apply SQL migrations in `turso/migrations` **in numeric order** through the latest file (see folder listing). **`013_break_multi_run.sql`** replaces the break-related tables with the current app schema (drops `breaks`, `break_prize_slots`, `break_spots`, `stream_breaks` and recreates them; clears `stream_items` break FKs). Run **after `012_breaks_and_pool.sql`**. Safe to re-run to repair a broken or partial break schema; it **deletes all break data**.

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
   - `SPOT_PRIMARY_FEED_URL` (only if you use pull ingest below)
   - `SPOT_FALLBACK_FEED_URL`
   - `SPOT_PUSH_SECRET` (recommended): long random string; enables **`POST /v1/spot/push`** for the VPS scraper.

5. **Spot updates (choose one or both)**

   **A. Push from VPS (recommended)**  
   Set **`SPOT_PUSH_SECRET`** on Railway to a strong random value. On the VPS, cron [`spot_scraper.py`](../spot_scraper.py) with environment:

   - **`GOLD_API_BASE_URL`** = your Railway API base URL (e.g. `https://your-service.up.railway.app`)
   - **`SPOT_PUSH_SECRET`** = same value as Railway

   The script POSTs the scraped payload to **`/v1/spot/push`** with `Authorization: Bearer <secret>`. The dashboard updates once the API inserts into Turso (and the web app refetches). Optional: keep **`--out /var/www/html/spot-feed.json`** if you still want a public file.

   **B. Pull ingest (`job:spot`)**  
   If you serve **`spot-feed.json`** at a **public HTTPS** URL, add a Railway Cron Job with the **same env as the API** running `npm --workspace @gold/api run job:spot` on your desired interval. Do **not** use `http://localhost/...` for **`SPOT_PRIMARY_FEED_URL`**; Railway cannot reach the VPS loopback.

6. **Cache headers for public `spot-feed.json` (pull ingest only)**  
   If you use **B**, avoid stale JSON behind a CDN:

   ```nginx
   location = /spot-feed.json {
       add_header Cache-Control "no-store";
   }
   ```

## Cloudflare Workers (Web)

The frontend is a **Cloudflare Worker** with `main = "worker.ts"` plus **static assets** from the Vite build (`[assets] directory = "./dist"`). Edge logic runs in [`apps/web/worker.ts`](apps/web/worker.ts) (e.g. `GET /health`); everything else is served from `dist/` via the `ASSETS` binding.

**Cloudflare Pages (Git):** [`apps/web/wrangler.toml`](apps/web/wrangler.toml) must include **`pages_build_output_dir = "./dist"`** so Pages does not skip the file during CI (Worker-only configs without that key are ignored).

1. Create a Workers (or compatible) project from this repo.
2. Set root directory: `apps/web`
3. Build command: `npm install && npm run build && npx wrangler deploy` (`npm run build` runs `tsc` + `vite build` so `dist/` exists before deploy).
4. Environment variables:
   - `VITE_API_BASE_URL` = Railway API URL
5. Custom domain:
   - attach `gold.jawnix.com` to the project.

## CORS

- Set API `CORS_ORIGIN` to `https://gold.jawnix.com` in production.
- For preview branches, include preview domains or use strict wildcard strategy with care.
