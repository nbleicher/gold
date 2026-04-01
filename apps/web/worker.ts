/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ASSETS: Fetcher;
}

function handleEdgeOnly(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return Response.json({ ok: true });
  }
  return null;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const edge = handleEdgeOnly(request);
    if (edge) return edge;

    // Add redirects, BFF routes, auth, etc. above this line.
    return env.ASSETS.fetch(request);
  },
};
