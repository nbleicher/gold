import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { one } from "../db.js";
import { applySpotPayloadToDb } from "../lib/ingestSpotSnapshots.js";
import { requireAuth } from "./auth.js";

const spotMetalSchema = z.object({
  price: z.number().positive(),
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

type SpotDbRow = {
  id: string;
  metal: "gold" | "silver";
  price: number | null;
  price_per_oz_usd: number | null;
  source_state: string | null;
  source: string | null;
  created_at: string;
};

function normalizeSpotRow(row: SpotDbRow | null) {
  if (!row) return null;
  const price = Number(row.price ?? row.price_per_oz_usd ?? 0);
  if (!(price > 0)) return null;
  return {
    id: row.id,
    metal: row.metal,
    price,
    sourceState: row.source_state ?? row.source ?? "unknown",
    createdAt: row.created_at
  };
}

export async function registerSpotRoutes(app: FastifyInstance) {
  app.post("/v1/spot/push", async (req, reply) => {
    const secret = env.spotPushSecret?.trim();
    if (!secret) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (!spotPushBearerOk(req.headers.authorization, secret)) {
      req.log.warn(
        {
          hasAuthHeader: Boolean(req.headers.authorization),
          authScheme: req.headers.authorization?.split(" ")[0] ?? null
        },
        "spot push unauthorized"
      );
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const parsed = spotPushBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid body", details: parsed.error.flatten() });
    }
    await applySpotPayloadToDb(parsed.data);
    return { ok: true };
  });

  app.get("/v1/spot/latest", { preHandler: requireAuth }, async (_req, reply) => {
    reply.header("Cache-Control", "no-store, no-cache, must-revalidate");
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");
    const [goldRow, silverRow] = await Promise.all([
      one<SpotDbRow>(
        `select id, metal, price, price_per_oz_usd, source_state, source, created_at
         from spot_snapshots where metal = 'gold' order by created_at desc limit 1`
      ),
      one<SpotDbRow>(
        `select id, metal, price, price_per_oz_usd, source_state, source, created_at
         from spot_snapshots where metal = 'silver' order by created_at desc limit 1`
      )
    ]);

    const gold = normalizeSpotRow(goldRow);
    const silver = normalizeSpotRow(silverRow);
    const tGold = gold?.createdAt ? new Date(String(gold.createdAt)).getTime() : 0;
    const tSilver = silver?.createdAt ? new Date(String(silver.createdAt)).getTime() : 0;
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
