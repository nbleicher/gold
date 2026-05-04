# Deployment Guide

## Turso

1. Create Turso database and auth token.
2. Apply SQL migrations in `turso/migrations` **in numeric order** through the latest file (see folder listing). **`013_break_multi_run.sql`** replaces the break-related tables with the current app schema (drops `breaks`, `break_prize_slots`, `break_spots`, `stream_breaks` and recreates them; clears `stream_items` break FKs). Run **after `012_breaks_and_pool.sql`**. Safe to re-run to repair a broken or partial break schema; it **deletes all break data**.

   - `001_init.sql`
   - `002_seed_admin_template.sql` (after replacing placeholders)

## Railway (API + Spot Job)

1. Create Railway service from repo root.
2. Set service root/build context to repository root.
3. **Build:** [`railway.toml`](railway.toml) runs `npm --workspace @gold/shared run build && npm --workspace @gold/api run build` so TypeScript compiles during deploy (not on every container boot).
4. Set start command:
   - `npm --workspace @gold/api run start` (runs `node dist/server.js` only)
5. Configure env vars:
   - `PORT`
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `JWT_SECRET`
   - `CORS_ORIGIN`
   - `SPOT_PRIMARY_FEED_URL` (only if you use pull ingest below)
   - `SPOT_FALLBACK_FEED_URL`
   - `SPOT_PUSH_SECRET` (recommended): long random string; enables **`POST /v1/spot/push`** for the VPS scraper.

6. **Spot updates (choose one or both)**

   **A. Push from VPS (recommended)**  
   Set **`SPOT_PUSH_SECRET`** on Railway to a strong random value. On the VPS, cron [`spot_scraper.py`](../spot_scraper.py) with environment:

   - **`GOLD_API_BASE_URL`** = your Railway API base URL (e.g. `https://your-service.up.railway.app`)
   - **`SPOT_PUSH_SECRET`** = same value as Railway

   The script POSTs the scraped payload to **`/v1/spot/push`** with `Authorization: Bearer <secret>`. The dashboard updates once the API inserts into Turso (and the web app refetches). Optional: keep **`--out /var/www/html/spot-feed.json`** if you still want a public file.

   **B. Pull ingest (`job:spot`)**  
   If you serve **`spot-feed.json`** at a **public HTTPS** URL, add a Railway Cron Job with the **same env as the API** running `npm --workspace @gold/api run job:spot` on your desired interval. Do **not** use `http://localhost/...` for **`SPOT_PRIMARY_FEED_URL`**; Railway cannot reach the VPS loopback.

7. **Cache headers for public `spot-feed.json` (pull ingest only)**  
   If you use **B**, avoid stale JSON behind a CDN:

   ```nginx
   location = /spot-feed.json {
       add_header Cache-Control "no-store";
   }
   ```

## Cloudflare Pages + Worker (Web)

**Pages (Git):** [`apps/web/wrangler.toml`](apps/web/wrangler.toml) is **Pages-only**: `name`, `compatibility_date`, and **`pages_build_output_dir = "./dist"`**. Cloudflare forbids **`main` / `[assets]`** in the same file as **`pages_build_output_dir`**—use the split below.

**Worker + assets (optional manual deploy):** [`apps/web/wrangler.worker.toml`](apps/web/wrangler.worker.toml) contains `main = "worker.ts"` and `[assets]` for edge routes (e.g. `GET /health` in [`apps/web/worker.ts`](apps/web/worker.ts)) and SPA fallback. Deploy after build with:

`npm run build && npx wrangler deploy --config wrangler.worker.toml`

1. Create a **Pages** project from this repo (root directory `apps/web`).
2. Build command: `npm install && npm run build` (outputs `dist/`; Pages uploads from `pages_build_output_dir`).
3. Environment variables (Pages) — pick **one** API routing mode:

   **A — Direct to Railway (simplest)**  
   - `VITE_API_BASE_URL` = your **Railway API origin**, e.g. `https://your-service.up.railway.app`  
   - Must be `http://` or `https://`, no path after the host.  
   - Vite **bakes this in at build time**; after changing it, **redeploy** the site.

   **B — Same origin + edge proxy (fixes 405 when POST was hitting static Pages)**  
   - `GOLD_API_ORIGIN` = same Railway API origin as in **A** (set in Pages as a normal env var; **not** `VITE_*`).  
   - `VITE_API_BASE_URL` = your **site** origin (the Pages URL or custom domain), e.g. `https://gold.jawnix.com`  
   - Requests to `/v1/*` are handled by [`apps/web/functions/v1/[[path]].ts`](apps/web/functions/v1/[[path]].ts) and forwarded to Railway. Redeploy after changing either variable.

4. Custom domain: attach `gold.jawnix.com` to the Pages project.
5. If you need the Worker wrapper in production, deploy it separately with the command above (or host static-only on Pages; `/health` can live on the Railway API instead).

## CORS

- Set API `CORS_ORIGIN` to `https://gold.jawnix.com` in production.
- For preview branches, include preview domains or use strict wildcard strategy with care.

## Troubleshooting: login returns **405 Method Not Allowed**

`405` means the HTTP **method** is not allowed **at that URL’s handler**. For this app, `POST /v1/auth/login` must reach **Fastify on Railway** (or the Pages **proxy** that forwards `/v1/*` there). It is **not** a Turso/SQL error.

- **Expected request:** `POST` to `{resolved API base}/v1/auth/login` with JSON `{ "username", "password" }`, where the resolved base is either your Railway origin (**mode A**) or your site origin when **`GOLD_API_ORIGIN`** + proxy are configured (**mode B**).
- **Typical mistake:** `VITE_API_BASE_URL` points at the **Pages / static hostname** without **`GOLD_API_ORIGIN`** → the browser sends `POST` to the CDN/static layer, which often answers **405** for API paths.
- **Fix:** Use **mode A** (Railway URL in `VITE_API_BASE_URL`) or **mode B** (`GOLD_API_ORIGIN` + site URL in `VITE_API_BASE_URL`), then **redeploy** the Pages build.
- **Verify:** DevTools → Network → login request: host should be Railway **or** your domain with a **200/401** JSON body from the API, not **405** from a static response.

Database / Turso issues typically surface as **401** / **500**, not **405**.
