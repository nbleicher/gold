import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { one } from "../db.js";
import { ingestSpotSnapshots } from "../lib/ingestSpotSnapshots.js";
import { requireAuth } from "./auth.js";

async function loadLatestSpot() {
  const [gold, silver] = await Promise.all([
    one("select * from spot_snapshots where metal = 'gold' order by created_at desc limit 1"),
    one("select * from spot_snapshots where metal = 'silver' order by created_at desc limit 1")
  ]);
  return { gold, silver };
}

export async function registerSpotRoutes(app: FastifyInstance) {
  app.get("/v1/spot/latest", { preHandler: requireAuth }, async () => {
    let { gold, silver } = await loadLatestSpot();

    const tGold = gold?.created_at ? new Date(String(gold.created_at)).getTime() : 0;
    const tSilver = silver?.created_at ? new Date(String(silver.created_at)).getTime() : 0;
    const both = Boolean(gold && silver);
    const latest = Math.max(tGold, tSilver);
    const maxAge = env.spotOnDemandMaxAgeMs;
    const stale =
      maxAge > 0 && (!both || latest === 0 || Date.now() - latest > maxAge);

    const missingEither = !gold || !silver;

    if (stale && maxAge > 0) {
      if (missingEither) {
        try {
          await ingestSpotSnapshots();
          ({ gold, silver } = await loadLatestSpot());
        } catch (err) {
          app.log.warn({ err }, "spot ingest failed (initial/partial)");
        }
      } else {
        void ingestSpotSnapshots().catch((err) => {
          app.log.warn({ err }, "background spot ingest failed");
        });
      }
    }

    const tGold2 = gold?.created_at ? new Date(String(gold.created_at)).getTime() : 0;
    const tSilver2 = silver?.created_at ? new Date(String(silver.created_at)).getTime() : 0;
    const maxT = Math.max(tGold2, tSilver2);
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
