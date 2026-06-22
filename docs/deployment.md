# Deployment Guide

## Supabase

1. Create Supabase project.
2. Apply SQL migrations in `supabase/migrations` (or run `supabase db push`).
3. Enable Realtime for public tables used by streams (`streams`, `stream_items`, `break_spots`).

## Railway (API + Spot Job)

1. Create Railway service from repo root.
2. Set service root/build context to repository root.
3. **Build:** [`railway.toml`](railway.toml) runs `npm --workspace @gold/shared run build && npm --workspace @gold/api run build` so TypeScript compiles during deploy (not on every container boot). Railpack uses [`.node-version`](../.node-version) / [`railpack.json`](../railpack.json) (Node 20) and [`.dockerignore`](../.dockerignore) to keep the upload snapshot small.
4. Set start command:
   - `npm --workspace @gold/api run start` (runs `node dist/server.js` only)
5. Configure env vars:
   - `PORT`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGIN`
   - `SPOT_PRIMARY_FEED_URL` (only if you use pull ingest below)
   - `SPOT_FALLBACK_FEED_URL`
   - `SPOT_PUSH_SECRET` (recommended): long random string; enables **`POST /v1/spot/push`** for the VPS scraper.

6. **Spot updates (choose one or both)**

   **A. Push from VPS (recommended)**  
   Set **`SPOT_PUSH_SECRET`** on Railway to a strong random value. On the VPS, cron [`spot_scraper.py`](../spot_scraper.py) with environment:

   - **`GOLD_API_BASE_URL`** = your Railway API base URL (e.g. `https://your-service.up.railway.app`)
   - **`SPOT_PUSH_SECRET`** = same value as Railway

  The script POSTs the scraped payload to **`/v1/spot/push`** with `Authorization: Bearer <secret>`. The dashboard updates once the API inserts into Supabase Postgres (and the web app refetches). Optional: keep **`--out /var/www/html/spot-feed.json`** if you still want a public file.

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

## Troubleshooting: Railway build fails on `apt-get` / `libatomic1`

If deploy logs show **`No space left on device`** during `apt-get update` and then **`Unable to locate package libatomic1`**, the builder ran out of disk while preparing the runtime image — `libatomic1` is usually a follow-on error, not the root cause.

1. **Retry the deploy once** (Metal builders can hit transient disk limits).
2. Confirm the repo includes **`.dockerignore`** and that **`turso-export.json`** / **`turso-export-no-spots.json`** are **not** tracked in git (migration-only; regenerate locally with `npm run migrate:turso:export -- ./turso-export.json`).
3. Confirm **`.node-version`** / **`railpack.json`** pin Node 20 so Railpack does not pull Node 22’s extra runtime apt steps when unnecessary.

## CORS

- Set API `CORS_ORIGIN` to `https://gold.jawnix.com` in production.
- For preview branches, include preview domains or use strict wildcard strategy with care.

## Troubleshooting: login returns **405 Method Not Allowed**

`405` means the HTTP **method** is not allowed **at that URL’s handler**. For this app, `POST /v1/auth/login` must reach **Fastify on Railway** (or the Pages **proxy** that forwards `/v1/*` there). It is **not** a database migration error.

- **Expected request:** `POST` to `{resolved API base}/v1/auth/login` with JSON `{ "username", "password" }`, where the resolved base is either your Railway origin (**mode A**) or your site origin when **`GOLD_API_ORIGIN`** + proxy are configured (**mode B**).
- **Typical mistake:** `VITE_API_BASE_URL` points at the **Pages / static hostname** without **`GOLD_API_ORIGIN`** → the browser sends `POST` to the CDN/static layer, which often answers **405** for API paths.
- **Fix:** Use **mode A** (Railway URL in `VITE_API_BASE_URL`) or **mode B** (`GOLD_API_ORIGIN` + site URL in `VITE_API_BASE_URL`), then **redeploy** the Pages build.
- **Verify:** DevTools → Network → login request: host should be Railway **or** your domain with a **200/401** JSON body from the API, not **405** from a static response.

Database issues typically surface as **401** / **500**, not **405**.

**Login identifier:** Use your **`users.username`** value. If you type an **email**, only the part **before `@`** is matched (same rules as the DB migration): e.g. `admin@goldstream.com` is looked up as **`admin`**, not the full string.

Use **`https://`** for `VITE_API_BASE_URL` toward Railway — **`http://`** can redirect and turn **`POST` into `GET`**, which surfaces as **405** on `/v1/auth/login`.
