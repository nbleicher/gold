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

  app.get("/v1/streams/:id/items", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
    const stream = await one<{ user_id: string }>("select user_id from streams where id = ?", [id]);
    if (!stream) {
      return req.server.httpErrors.notFound("Stream not found");
    }
    if (!isAdmin && stream.user_id !== self) {
      return req.server.httpErrors.forbidden();
    }
    return q(
      "select * from stream_items where stream_id = ? order by created_at asc",
      [id]
    );
  });

  app.get("/v1/streams/:id/batches", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
    const stream = await one<{ user_id: string }>("select user_id from streams where id = ?", [id]);
    if (!stream) {
      return req.server.httpErrors.notFound("Stream not found");
    }
    if (!isAdmin && stream.user_id !== self) {
      return req.server.httpErrors.forbidden();
    }
    return q<{
      id: string;
      metal: string;
      batch_name: string | null;
      remaining_grams: number;
    }>(
      `select b.id, b.metal, b.batch_name, b.remaining_grams
       from stream_batches sb
       join inventory_batches b on b.id = sb.batch_id
       where sb.stream_id = ?
       order by b.created_at asc, b.id asc`,
      [id]
    );
  });

  app.post("/v1/streams/start", { preHandler: requireAuth }, async (req) => {
    const body = req.body as {
      userId: string;
      goldBatchId?: string | null;
      silverBatchId?: string | null;
    };
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
    if (!body.userId) {
      return req.server.httpErrors.badRequest("userId required");
    }
    if (!isAdmin && body.userId !== self) {
      return req.server.httpErrors.forbidden("Cannot start stream for another user");
    }

    const existing = await one<{ id: string }>(
      "select id from streams where user_id = ? and ended_at is null order by started_at desc limit 1",
      [body.userId]
    );
    if (existing) {
      return one("select * from streams where id = ?", [existing.id]);
    }

    return withWriteTx(async (tx) => {
      await txQ(tx, "insert into streams (user_id, gold_batch_id, silver_batch_id) values (?, ?, ?)", [
        body.userId,
        null,
        null
      ]);
      const stream = await txOne<Record<string, unknown>>(
        tx,
        "select * from streams order by rowid desc limit 1"
      );
      if (!stream || typeof stream.id !== "string") {
        throw new Error("Failed to create stream");
      }
      await txQ(tx, "insert into stream_batches (stream_id, batch_id) select ?, id from inventory_batches", [
        stream.id
      ]);
      return stream;
    });
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
    const parsed = createStickerSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return req.server.httpErrors.badRequest("Invalid sticker sale payload");
    }
    const body = parsed.data;
    const stream = await one<{ id: string; ended_at: string | null }>(
      "select id, ended_at from streams where id = ?",
      [body.streamId]
    );
    if (!stream) {
      return req.server.httpErrors.notFound("Stream not found");
    }
    if (stream.ended_at) {
      return req.server.httpErrors.conflict("Stream is not live");
    }
    const order = await one<{
      id: string;
      metal: "gold" | "silver" | "mixed";
      primary_batch_id: string;
      actual_weight_grams: number;
    }>(
      "select id, metal, primary_batch_id, actual_weight_grams from bag_orders where sticker_code = ?",
      [body.stickerCode.toUpperCase()]
    );
    if (!order) {
      return req.server.httpErrors.notFound("Unknown sticker");
    }
    const existing = await one<{ id: string }>(
      "select id from stream_items where sale_type = 'sticker' and upper(sticker_code) = ? limit 1",
      [body.stickerCode.toUpperCase()]
    );
    if (existing) {
      return req.server.httpErrors.conflict("Sticker already sold");
    }
    const components = await q<{ metal: "gold" | "silver"; weight_grams: number }>(
      "select metal, weight_grams from bag_order_components where bag_order_id = ?",
      [order.id]
    );
    let totalWeight = 0;
    let totalSpotValue = 0;
    const compList = components ?? [];
    if (compList.length > 0) {
      for (const c of compList) {
        const spot = await getLatestSpot(c.metal);
        totalWeight += Number(c.weight_grams);
        totalSpotValue += Number(c.weight_grams) * (spot / OZT_TO_GRAMS);
      }
    } else {
      const w = Number(order.actual_weight_grams);
      if (!(w > 0)) {
        return req.server.httpErrors.badRequest("Bag has no component weights and invalid total weight");
      }
      totalWeight = w;
      if (order.metal === "mixed") {
        const gSpot = await getLatestSpot("gold");
        const sSpot = await getLatestSpot("silver");
        const avgPerGram = (gSpot + sSpot) / 2 / OZT_TO_GRAMS;
        totalSpotValue = w * avgPerGram;
      } else {
        const m = order.metal === "silver" ? "silver" : "gold";
        const spot = await getLatestSpot(m);
        totalSpotValue = w * (spot / OZT_TO_GRAMS);
      }
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
    if (!stream) {
      return req.server.httpErrors.notFound("Stream missing");
    }

    const snapshotCountRow = await one<{ c: unknown }>(
      "select count(*) as c from stream_batches where stream_id = ?",
      [body.streamId]
    );
    const snapshotN = Number(
      typeof snapshotCountRow?.c === "bigint" ? snapshotCountRow.c : snapshotCountRow?.c ?? 0
    );

    let batchId: string | null = null;
    if (snapshotN > 0) {
      const picked = await one<{ id: string }>(
        `select b.id from stream_batches sb
         join inventory_batches b on b.id = sb.batch_id
         where sb.stream_id = ? and b.metal = ? and b.remaining_grams >= ?
         order by b.created_at asc, b.id asc
         limit 1`,
        [body.streamId, body.metal, body.weightGrams]
      );
      if (!picked) {
        return req.server.httpErrors.badRequest(
          `No ${body.metal} batch in this stream's inventory snapshot has enough remaining grams for this raw sale`
        );
      }
      batchId = picked.id;
    } else {
      batchId = body.metal === "gold" ? stream.gold_batch_id : stream.silver_batch_id;
      if (!batchId) {
        return req.server.httpErrors.badRequest(`No active ${body.metal} batch selected for this stream`);
      }
    }

    const batch = await one<{ id: string; remaining_grams: number }>(
      "select id, remaining_grams from inventory_batches where id = ?",
      [batchId]
    );
    if (!batch) {
      return req.server.httpErrors.badRequest("Batch missing");
    }
    if (Number(batch.remaining_grams) < body.weightGrams) {
      return req.server.httpErrors.badRequest("Insufficient remaining grams");
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
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";

    const row = await one<{
      item_id: string;
      sale_type: string;
      batch_id: string | null;
      weight_grams: number;
      sticker_code: string | null;
      stream_user_id: string;
    }>(
      `select si.id as item_id, si.sale_type, si.batch_id, si.weight_grams, si.sticker_code, s.user_id as stream_user_id
       from stream_items si
       join streams s on s.id = si.stream_id
       where si.id = ?`,
      [id]
    );
    if (!row) {
      return req.server.httpErrors.notFound("Item not found");
    }
    if (!isAdmin && row.stream_user_id !== self) {
      return req.server.httpErrors.forbidden();
    }

    return withWriteTx(async (tx) => {
      if (row.sale_type === "raw" && row.batch_id) {
        await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams + ? where id = ?", [
          row.weight_grams,
          row.batch_id
        ]);
      }
      if (row.sale_type === "sticker" && row.sticker_code) {
        await txQ(tx, "update bag_orders set sold_at = null where upper(sticker_code) = ?", [
          row.sticker_code.toUpperCase()
        ]);
      }
      await txQ(tx, "delete from stream_items where id = ?", [id]);
      return { ok: true };
    });
  });
}
