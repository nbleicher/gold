import type { FastifyInstance } from "fastify";
import { one } from "../db.js";
import { requireAuth } from "./auth.js";

export async function registerSpotRoutes(app: FastifyInstance) {
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
