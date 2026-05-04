/**
 * Proxies `/v1/*` from the Pages origin to the Railway API (or any backend origin).
 * Set `GOLD_API_ORIGIN` in Cloudflare Pages → Settings → Environment variables
 * (e.g. `https://your-service.up.railway.app`, no path after the host).
 *
 * Then set `VITE_API_BASE_URL` at build time to your **site** origin (same as the browser),
 * e.g. `https://gold.jawnix.com`, so `POST /v1/auth/login` hits this function instead of static assets.
 */

type PagesEnv = {
  GOLD_API_ORIGIN?: string;
};

export async function onRequest(context: {
  request: Request;
  env: PagesEnv;
}): Promise<Response> {
  const { request, env } = context;
  const raw = env.GOLD_API_ORIGIN?.trim();
  if (!raw) {
    return Response.json(
      {
        error:
          "GOLD_API_ORIGIN is not set. Add it in Cloudflare Pages environment variables (Railway API origin, e.g. https://your-service.up.railway.app)."
      },
      { status: 500 }
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(raw);
  } catch {
    return Response.json({ error: "GOLD_API_ORIGIN is not a valid URL." }, { status: 500 });
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    return Response.json({ error: "GOLD_API_ORIGIN must use http:// or https://." }, { status: 500 });
  }

  const base = baseUrl.href.replace(/\/$/, "");
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, `${base}/`);

  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade"
  ]);

  const outHeaders = new Headers();
  for (const [key, value] of request.headers) {
    const lower = key.toLowerCase();
    if (hopByHop.has(lower) || lower === "host") continue;
    outHeaders.append(key, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  return fetch(target.toString(), {
    method: request.method,
    headers: outHeaders,
    body: hasBody ? request.body : undefined
  });
}
