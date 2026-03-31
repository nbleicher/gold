import type { FastifyInstance } from "fastify";
import { one } from "../db.js";
import { requireAuth } from "./auth.js";

export async function registerSpotRoutes(app: FastifyInstance) {
  app.get("/v1/spot/latest", { preHandler: requireAuth }, async () => {
    const [gold, silver] = await Promise.all([
      one("select * from spot_snapshots where metal = 'gold' order by created_at desc limit 1"),
      one("select * from spot_snapshots where metal = 'silver' order by created_at desc limit 1")
    ]);
    if (!gold || !silver) throw new Error("Spot feed unavailable");
    return {
      gold,
      silver,
      updatedAt: new Date().toISOString()
    };
  });
}
