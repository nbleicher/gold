import type { FastifyInstance } from "fastify";
import { createRawSaleSchema, createStickerSaleSchema } from "@gold/shared";
import { one, q, txQ, txOne, withWriteTx } from "../db.js";
import { requireAuth } from "./auth.js";

const OZT_TO_GRAMS = 31.1034768;

async function getLatestSpot(metal: "gold" | "silver") {
  const row = await one<{ price: number }>(
    "select price from spot_snapshots where metal = ? order by created_at desc limit 1",
    [metal]
  );
  if (!row) throw new Error(`No ${metal} spot`);
  return Number(row.price);
}

export async function registerStreamRoutes(app: FastifyInstance) {
  app.get("/v1/streams", { preHandler: requireAuth }, async (req) => {
    const { userId } = req.query as { userId?: string };
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
    if (isAdmin && !userId) {
      return q("select * from streams order by started_at desc");
    }
    const filterId = userId ?? self;
    if (!filterId) throw new Error("Unauthorized");
    if (!isAdmin && userId && userId !== self) throw new Error("Forbidden");
    return q("select * from streams where user_id = ? order by started_at desc", [filterId]);
  });

  app.post("/v1/streams/start", { preHandler: requireAuth }, async (req) => {
    const body = req.body as {
      userId: string;
      goldBatchId?: string | null;
      silverBatchId?: string | null;
    };
    if (!body.goldBatchId && !body.silverBatchId) {
      return req.server.httpErrors.badRequest("Select at least one metal batch before starting stream");
    }
    await q(
      "insert into streams (user_id, gold_batch_id, silver_batch_id) values (?, ?, ?)",
      [body.userId, body.goldBatchId ?? null, body.silverBatchId ?? null]
    );
    return one("select * from streams order by rowid desc limit 1");
  });

  app.post("/v1/streams/:id/end", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const stream = await one<{ user_id: string }>("select user_id from streams where id = ?", [id]);
    if (!stream) {
      return { ok: true, idempotent: true };
    }
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
    if (!isAdmin && stream.user_id !== self) throw new Error("Forbidden");

    const countRows = await q("select count(*) from stream_items where stream_id = ?", [id]);
    const first = countRows[0] as unknown as { 0?: unknown } | undefined;
    const raw = first?.[0];
    const n = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);

    if (n === 0) {
      await q("delete from streams where id = ?", [id]);
      return { ok: true, discarded: true };
    }
    await q("update streams set ended_at = ? where id = ?", [new Date().toISOString(), id]);
    return { ok: true, discarded: false };
  });

  app.post("/v1/streams/sticker-sale", { preHandler: requireAuth }, async (req) => {
    const body = createStickerSaleSchema.parse(req.body);
    const order = await one<{ id: string; metal: "gold" | "silver" | "mixed"; primary_batch_id: string }>(
      "select id, metal, primary_batch_id from bag_orders where sticker_code = ?",
      [body.stickerCode.toUpperCase()]
    );
    if (!order) throw new Error("Unknown sticker");
    const existing = await one<{ id: string }>(
      "select id from stream_items where sale_type = 'sticker' and upper(sticker_code) = ? limit 1",
      [body.stickerCode.toUpperCase()]
    );
    if (existing) throw new Error("Sticker already sold");
    const components = await q<{ metal: "gold" | "silver"; weight_grams: number }>(
      "select metal, weight_grams from bag_order_components where bag_order_id = ?",
      [order.id]
    );
    let totalWeight = 0;
    let totalSpotValue = 0;
    for (const c of components ?? []) {
      const spot = await getLatestSpot(c.metal);
      totalWeight += Number(c.weight_grams);
      totalSpotValue += Number(c.weight_grams) * (spot / OZT_TO_GRAMS);
    }
    const spotPrice = totalWeight ? (totalSpotValue / totalWeight) * OZT_TO_GRAMS : 0;
    const codeUpper = body.stickerCode.toUpperCase();

    return withWriteTx(async (tx) => {
      await txQ(
        tx,
        "insert into stream_items (stream_id, sale_type, name, metal, weight_grams, spot_value, spot_price, sticker_code, batch_id) values (?, 'sticker', ?, ?, ?, ?, ?, ?, ?)",
        [
          body.streamId,
          codeUpper,
          order.metal,
          totalWeight,
          totalSpotValue,
          spotPrice,
          codeUpper,
          order.primary_batch_id
        ]
      );
      await txQ(
        tx,
        "update bag_orders set sold_at = coalesce(sold_at, datetime('now')) where upper(sticker_code) = ?",
        [codeUpper]
      );
      return txOne(
        tx,
        "select * from stream_items where stream_id = ? order by created_at desc limit 1",
        [body.streamId]
      );
    });
  });

  app.post("/v1/streams/raw-sale", { preHandler: requireAuth }, async (req) => {
    const body = createRawSaleSchema.parse(req.body);
    const stream = await one<{ id: string; gold_batch_id: string | null; silver_batch_id: string | null }>(
      "select id, gold_batch_id, silver_batch_id from streams where id = ?",
      [body.streamId]
    );
    if (!stream) throw new Error("Stream missing");
    const batchId =
      body.metal === "gold" ? stream.gold_batch_id : stream.silver_batch_id;
    if (!batchId) throw new Error(`No active ${body.metal} batch selected`);

    const batch = await one<{ id: string; remaining_grams: number }>(
      "select id, remaining_grams from inventory_batches where id = ?",
      [batchId]
    );
    if (!batch) throw new Error("Batch missing");
    if (Number(batch.remaining_grams) < body.weightGrams) {
      throw new Error("Insufficient remaining grams");
    }

    const spot = await getLatestSpot(body.metal);
    const spotValue = body.weightGrams * (spot / OZT_TO_GRAMS);
    return withWriteTx(async (tx) => {
      await txQ(
        tx,
        "insert into stream_items (stream_id, sale_type, name, metal, weight_grams, spot_value, spot_price, batch_id) values (?, 'raw', ?, ?, ?, ?, ?, ?)",
        [
          body.streamId,
          `Raw ${body.weightGrams}g ${body.metal}`,
          body.metal,
          body.weightGrams,
          spotValue,
          spot,
          batchId
        ]
      );
      await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
        body.weightGrams,
        batchId
      ]);
      return txOne(tx, "select * from stream_items order by rowid desc limit 1");
    });
  });

  app.delete("/v1/streams/items/:id", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const item = await one<{ id: string; sale_type: string; batch_id: string | null; weight_grams: number }>(
      "select id, sale_type, batch_id, weight_grams from stream_items where id = ?",
      [id]
    );
    if (!item) throw new Error("Item not found");

    if (item.sale_type === "raw" && item.batch_id) {
      await q("update inventory_batches set remaining_grams = remaining_grams + ? where id = ?", [
        item.weight_grams,
        item.batch_id
      ]);
    }

    await q("delete from stream_items where id = ?", [id]);
    return { ok: true };
  });
}
