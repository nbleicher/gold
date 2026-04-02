import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { one } from "../db.js";
import { applySpotPayloadToDb } from "../lib/ingestSpotSnapshots.js";
import { requireAuth } from "./auth.js";

const spotMetalSchema = z.object({
  price: z.number().nonnegative(),
  sourceState: z.string().min(1)
});

const spotPushBodySchema = z.object({
  gold: spotMetalSchema,
  silver: spotMetalSchema,
  updatedAt: z.string().optional()
});

function spotPushBearerOk(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length);
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function registerSpotRoutes(app: FastifyInstance) {
  app.post("/v1/spot/push", async (req, reply) => {
    const secret = env.spotPushSecret?.trim();
    if (!secret) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (!spotPushBearerOk(req.headers.authorization, secret)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const parsed = spotPushBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    await applySpotPayloadToDb(parsed.data);
    return { ok: true };
  });

  app.get("/v1/spot/latest", { preHandler: requireAuth }, async () => {
    const [gold, silver] = await Promise.all([
      one("select * from spot_snapshots where metal = 'gold' order by created_at desc limit 1"),
      one("select * from spot_snapshots where metal = 'silver' order by created_at desc limit 1")
    ]);

    const tGold = gold?.created_at ? new Date(String(gold.created_at)).getTime() : 0;
    const tSilver = silver?.created_at ? new Date(String(silver.created_at)).getTime() : 0;
    const maxT = Math.max(tGold, tSilver);
    const updatedAt = maxT > 0 ? new Date(maxT).toISOString() : new Date().toISOString();

    const available = Boolean(gold && silver);
    const partial = Boolean(gold || silver) && !available;

    return {
      gold: gold ?? null,
      silver: silver ?? null,
      available,
      partial,
      updatedAt
    };
  });
}
