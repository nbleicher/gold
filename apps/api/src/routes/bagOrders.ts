import type { FastifyInstance } from "fastify";
import { createBagOrderSchema } from "@gold/shared";
import { one, q, txOne, txQ, withWriteTx } from "../db.js";
import { getTierIndex, seqFromIndex } from "../domain/tiers.js";
import { requireAuth, requireRole } from "./auth.js";

export async function registerBagOrderRoutes(app: FastifyInstance) {
  app.get("/v1/bag-orders", { preHandler: requireAuth }, async () => {
    const orders = await q<Record<string, unknown>>(
      "select id, primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code, created_at, sold_at from bag_orders order by created_at desc"
    );
    const comps = await q<Record<string, unknown>>(
      "select id, bag_order_id, batch_id, metal, weight_grams, created_at from bag_order_components"
    );
    const streamSoldCodes = await q<{ c: string }>(
      "select distinct upper(sticker_code) as c from stream_items where sale_type = 'sticker' and sticker_code is not null"
    );
    const soldSet = new Set(streamSoldCodes.map((r) => r.c));
    return orders.map((o) => {
      const code = String(o.sticker_code ?? "").toUpperCase();
      const soldAt = o.sold_at != null && o.sold_at !== "";
      return {
        ...o,
        sold: soldAt || (code.length > 0 && soldSet.has(code)),
        bag_order_components: comps.filter((c) => c.bag_order_id === o.id)
      };
    });
  });

  app.post("/v1/bag-orders", { preHandler: requireRole("admin") }, async (req, reply) => {
    const parsed = createBagOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid bag order payload",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code
        }))
      });
    }
    const body = parsed.data;
    const primary = await one<{ id: string; remaining_grams: number; sticker_batch_letter: string }>(
      "select id, remaining_grams, sticker_batch_letter from inventory_batches where id = ?",
      [body.primaryBatchId]
    );
    if (!primary) throw new Error("Batch missing");
    if (Number(primary.remaining_grams) < body.primaryWeightGrams) {
      throw new Error("Insufficient primary batch grams");
    }

    const totalWeight = body.primaryWeightGrams + (body.secondWeightGrams ?? 0);
    const tierIndex = getTierIndex(totalWeight);
    if (!tierIndex) throw new Error("Weight does not match tier");

    const countRow = await one<{ count: number }>(
      "select count(*) as count from bag_orders where primary_batch_id = ? and tier_index = ?",
      [body.primaryBatchId, tierIndex]
    );
    const stickerCode =
      `${primary.sticker_batch_letter}${tierIndex}${seqFromIndex(countRow?.count ?? 0)}`.toUpperCase();

    return withWriteTx(async (tx) => {
      await txQ(
        tx,
        "insert into bag_orders (primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code) values (?, ?, ?, ?, ?)",
        [body.primaryBatchId, body.secondWeightGrams ? "mixed" : body.primaryMetal, totalWeight, tierIndex, stickerCode]
      );
      const order = await txOne<{ id: string }>(
        tx,
        "select id from bag_orders where sticker_code = ?",
        [stickerCode]
      );
      if (!order) throw new Error("Failed to create bag order");

      await txQ(
        tx,
        "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values (?, ?, ?, ?)",
        [order.id, body.primaryBatchId, body.primaryMetal, body.primaryWeightGrams]
      );

      if (body.secondBatchId && body.secondMetal && body.secondWeightGrams) {
        const second = await txOne<{ id: string; remaining_grams: number }>(
          tx,
          "select id, remaining_grams from inventory_batches where id = ?",
          [body.secondBatchId]
        );
        if (!second) throw new Error("Second batch missing");
        if (Number(second.remaining_grams) < body.secondWeightGrams) {
          throw new Error("Insufficient second batch grams");
        }
        await txQ(
          tx,
          "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values (?, ?, ?, ?)",
          [order.id, body.secondBatchId, body.secondMetal, body.secondWeightGrams]
        );
        await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
          body.secondWeightGrams,
          body.secondBatchId
        ]);
      }

      await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
        body.primaryWeightGrams,
        body.primaryBatchId
      ]);
      return txOne(tx, "select * from bag_orders where sticker_code = ?", [stickerCode]);
    });
  });

  app.patch("/v1/bag-orders/:id/mark-sold", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const existing = await one<{ sold_at: string | null }>("select sold_at from bag_orders where id = ?", [id]);
    if (!existing) throw new Error("Bag order not found");
    if (existing.sold_at) {
      return one("select * from bag_orders where id = ?", [id]);
    }
    await q("update bag_orders set sold_at = datetime('now') where id = ?", [id]);
    return one("select * from bag_orders where id = ?", [id]);
  });

  app.delete("/v1/bag-orders/:id", { preHandler: requireRole("admin") }, async (_req, reply) => {
    return reply.status(405).send({ error: "Bag orders cannot be deleted" });
  });
}
