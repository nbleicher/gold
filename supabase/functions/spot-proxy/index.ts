// Example non-critical Edge Function used during migration rehearsal.
// Deploy with: supabase functions deploy spot-proxy
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true, received: body }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
