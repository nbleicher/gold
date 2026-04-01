/// <reference types="@cloudflare/workers-types" />
function handleEdgeOnly(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
        return Response.json({ ok: true });
    }
    return null;
}
export default {
    async fetch(request, env, _ctx) {
        const edge = handleEdgeOnly(request);
        if (edge)
            return edge;
        // Add redirects, BFF routes, auth, etc. above this line.
        return env.ASSETS.fetch(request);
    },
};
