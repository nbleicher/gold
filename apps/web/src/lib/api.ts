const TOKEN_KEY = "gold_auth_token";

/** Lazily validated; throws on first request if env is wrong (avoids silent `undefined/v1/...` misroutes). */
let cachedApiBase: string | null = null;

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function getResolvedApiBaseUrl(): string {
  if (cachedApiBase) return cachedApiBase;

  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string" || !raw.trim()) {
    // Production SPA on Cloudflare Pages: same-origin `/v1/*` is proxied when GOLD_API_ORIGIN is set.
    if (import.meta.env.PROD && typeof window !== "undefined") {
      cachedApiBase = window.location.origin;
      return cachedApiBase;
    }
    throw new Error(
      "Missing VITE_API_BASE_URL. Set it at build time (e.g. Cloudflare Pages) to your Railway API origin (https://…), or leave unset in production and set GOLD_API_ORIGIN so same-origin /v1/* is proxied."
    );
  }

  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid VITE_API_BASE_URL: "${trimmed}". Must be a full URL such as https://your-service.up.railway.app`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid VITE_API_BASE_URL: must use http:// or https:// (got ${parsed.protocol})`
    );
  }

  // Avoid http→https redirects turning POST into GET (405 on GET /v1/auth/login).
  let href = parsed.href.replace(/\/$/, "");
  if (parsed.protocol === "http:" && !isLocalHost(parsed.hostname)) {
    href = href.replace(/^http:\/\//i, "https://").replace(/\/$/, "");
  }

  cachedApiBase = href;
  return cachedApiBase;
}

function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with /, got: ${path}`);
  }
  return new URL(path, `${getResolvedApiBaseUrl()}/`).toString();
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

const METHODS_DEFAULT_JSON_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const method = (init?.method ?? "GET").toUpperCase();
  const body =
    init?.body !== undefined
      ? init.body
      : METHODS_DEFAULT_JSON_BODY.has(method)
        ? JSON.stringify({})
        : undefined;
  const url = resolveApiUrl(path);
  const res = await fetch(url, {
    ...init,
    cache: path === "/v1/spot/latest" ? "no-store" : init?.cache,
    body,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed: ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j?.error === "string" && j.error.trim()) message = j.error.trim();
    } catch {
      /* keep message */
    }
    if (res.status === 405) {
      message = `405 Method Not Allowed at ${url}. The browser must reach your Railway API (set VITE_API_BASE_URL to the Railway origin), or use same-origin mode: set GOLD_API_ORIGIN on Cloudflare Pages and VITE_API_BASE_URL to this site’s URL so /v1/* is proxied. Details: docs/deployment.md. Response: ${message}`;
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
