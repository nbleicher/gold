import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function registerSpotRoutes(app: FastifyInstance) {
  app.get("/v1/spot/latest", async () => {
    const [gold, silver] = await Promise.all([
      db
        .from("spot_snapshots")
        .select("*")
        .eq("metal", "gold")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
      db
        .from("spot_snapshots")
        .select("*")
        .eq("metal", "silver")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()
    ]);
    if (gold.error || silver.error) throw gold.error ?? silver.error;
    return {
      gold: gold.data,
      silver: silver.data,
      updatedAt: new Date().toISOString()
    };
  });
}
