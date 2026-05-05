import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRawSaleSchema, createStickerSaleSchema, TROY_OUNCES_TO_GRAMS } from "@gold/shared";
import { z } from "zod";
import { one, q, txQ, txOne, withWriteTx } from "../db.js";
import {
  buildBatchMap,
  buildComponentsByOrder,
  buildOrderBySticker,
  cogsForItem,
  type BatchRow,
  type ComponentRow,
  type StreamItemCogsInput
} from "../domain/streamCogs.js";
import { requireAuth } from "./auth.js";

const startStreamBodySchema = z.object({
  userId: z.string().min(1),
  streamKind: z.enum(["break", "sticker"]).optional().default("break")
});

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
    const parsed = startStreamBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return req.server.httpErrors.badRequest("userId and optional streamKind (break | sticker) required");
    }
    const body = parsed.data;
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
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

    const streamKind = body.streamKind;

    return withWriteTx(async (tx) => {
      await txQ(
        tx,
        "insert into streams (user_id, gold_batch_id, silver_batch_id, stream_kind) values (?, ?, ?, ?)",
        [body.userId, null, null, streamKind]
      );
      const stream = await txOne<Record<string, unknown>>(
        tx,
        "select * from streams order by created_at desc, id desc limit 1"
      );
      if (!stream || typeof stream.id !== "string") {
        throw new Error("Failed to create stream");
      }
      if (streamKind === "break") {
        await txQ(tx, "insert into stream_batches (stream_id, batch_id) select ?, id from inventory_batches", [
          stream.id
        ]);
      }
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

  async function runStickerSale(req: FastifyRequest) {
    const parsed = createStickerSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return req.server.httpErrors.badRequest("Invalid sticker sale payload");
    }
    const saleBody = parsed.data;
    const self = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";

    const stream = await one<{
      id: string;
      ended_at: string | null;
      user_id: string;
      stream_kind: string;
    }>("select id, ended_at, user_id, stream_kind from streams where id = ?", [saleBody.streamId]);
    if (!stream) {
      return req.server.httpErrors.notFound("Stream not found");
    }
    if (!isAdmin && stream.user_id !== self) {
      return req.server.httpErrors.forbidden();
    }
    if (stream.ended_at) {
      return req.server.httpErrors.conflict("Stream is not live");
    }
    if (stream.stream_kind !== "sticker") {
      return req.server.httpErrors.badRequest("Sticker sales only apply to sticker streams");
    }

    const order = await one<{
      id: string;
      metal: "gold" | "silver" | "mixed";
      primary_batch_id: string;
      actual_weight_grams: number;
      sticker_code: string;
    }>(
      "select id, metal, primary_batch_id, actual_weight_grams, sticker_code from bag_orders where upper(sticker_code) = ?",
      [saleBody.stickerCode.toUpperCase()]
    );
    if (!order) {
      return req.server.httpErrors.notFound("Unknown sticker");
    }
    const existing = await one<{ id: string }>(
      "select id from stream_items where sale_type = 'sticker' and upper(sticker_code) = ? limit 1",
      [saleBody.stickerCode.toUpperCase()]
    );
    if (existing) {
      return req.server.httpErrors.conflict("Sticker already sold");
    }
    const components = await q<{ batch_id: string; weight_grams: number }>(
      "select batch_id, weight_grams from bag_order_components where bag_order_id = ?",
      [order.id]
    );
    const compList = components ?? [];
    const batchIdSet = new Set<string>();
    batchIdSet.add(order.primary_batch_id);
    for (const c of compList) {
      batchIdSet.add(c.batch_id);
    }
    const batchIds = [...batchIdSet];
    const bph = batchIds.map(() => "?").join(",");
    const batchRows = await q<BatchRow>(
      `select id, total_cost, grams from inventory_batches where id in (${bph})`,
      batchIds
    );
    const batchById = buildBatchMap(batchRows);
    const orderMap = buildOrderBySticker([
      {
        id: order.id,
        primary_batch_id: order.primary_batch_id,
        actual_weight_grams: order.actual_weight_grams,
        sticker_code: String(order.sticker_code).trim().toUpperCase()
      }
    ]);
    const compRows: ComponentRow[] = compList.map((c) => ({
      bag_order_id: order.id,
      batch_id: c.batch_id,
      weight_grams: c.weight_grams
    }));
    const componentsByOrderId = buildComponentsByOrder(compRows);

    let totalWeight = 0;
    if (compList.length > 0) {
      for (const c of compList) {
        totalWeight += Number(c.weight_grams);
      }
    } else {
      const w = Number(order.actual_weight_grams);
      if (!(w > 0)) {
        return req.server.httpErrors.badRequest("Bag has no component weights and invalid total weight");
      }
      totalWeight = w;
    }

    const codeUpper = saleBody.stickerCode.toUpperCase();
    const itemInput: StreamItemCogsInput = {
      id: "pending",
      stream_id: saleBody.streamId,
      sale_type: "sticker",
      batch_id: order.primary_batch_id,
      weight_grams: totalWeight,
      sticker_code: codeUpper
    };
    /** Cost basis (same path as COGS / break-style inventory average), not live spot. */
    const totalCogs = cogsForItem(itemInput, batchById, orderMap, componentsByOrderId);
    const spotPrice = totalWeight > 0 ? (totalCogs / totalWeight) * TROY_OUNCES_TO_GRAMS : 0;

    return withWriteTx(async (tx) => {
      await txQ(
        tx,
        "insert into stream_items (stream_id, sale_type, name, metal, weight_grams, spot_value, spot_price, sticker_code, batch_id) values (?, 'sticker', ?, ?, ?, ?, ?, ?, ?)",
        [
          saleBody.streamId,
          codeUpper,
          order.metal,
          totalWeight,
          totalCogs,
          spotPrice,
          codeUpper,
          order.primary_batch_id
        ]
      );
      await txQ(
        tx,
        "update bag_orders set sold_at = coalesce(sold_at, now()) where upper(sticker_code) = ?",
        [codeUpper]
      );
      return txOne(
        tx,
        "select * from stream_items where stream_id = ? order by created_at desc limit 1",
        [saleBody.streamId]
      );
    });
  }

  app.post("/v1/streams/sticker-sale", { preHandler: requireAuth }, async (req) => {
    return runStickerSale(req);
  });

  app.post("/v1/streams/_legacy-sticker-sale", { preHandler: requireAuth }, async (req) => {
    return runStickerSale(req);
  });

  app.post("/v1/streams/raw-sale", { preHandler: requireAuth }, async (req) => {
    const body = createRawSaleSchema.parse(req.body);
    const stream = await one<{
      id: string;
      gold_batch_id: string | null;
      silver_batch_id: string | null;
      stream_kind: string;
    }>("select id, gold_batch_id, silver_batch_id, stream_kind from streams where id = ?", [body.streamId]);
    if (!stream) {
      return req.server.httpErrors.notFound("Stream missing");
    }
    if (stream.stream_kind === "sticker") {
      return req.server.httpErrors.badRequest("Raw metal sales are not available on sticker streams");
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
    const spotValue = body.weightGrams * (spot / TROY_OUNCES_TO_GRAMS);
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
      return txOne(tx, "select * from stream_items order by created_at desc, id desc limit 1");
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
