import type { FastifyInstance } from "fastify";
import { createBagOrderSchema } from "@gold/shared";
import { db, one, q } from "../db.js";
import { getTierIndex, seqFromIndex } from "../domain/tiers.js";
import { requireAuth, requireRole } from "./auth.js";

export async function registerBagOrderRoutes(app: FastifyInstance) {
  app.get("/v1/bag-orders", { preHandler: requireAuth }, async () => {
    const orders = await q<Record<string, unknown>>(
      "select id, primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code, created_at from bag_orders order by created_at desc"
    );
    const comps = await q<Record<string, unknown>>(
      "select id, bag_order_id, batch_id, metal, weight_grams, created_at from bag_order_components"
    );
    return orders.map((o) => ({
      ...o,
      bag_order_components: comps.filter((c) => c.bag_order_id === o.id)
    }));
  });

  app.post("/v1/bag-orders", { preHandler: requireRole("admin") }, async (req) => {
    const body = createBagOrderSchema.parse(req.body);
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

    await q("begin");
    try {
      await q(
        "insert into bag_orders (primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code) values (?, ?, ?, ?, ?)",
        [body.primaryBatchId, body.secondWeightGrams ? "mixed" : body.primaryMetal, totalWeight, tierIndex, stickerCode]
      );
      const order = await one<{ id: string }>(
        "select id from bag_orders where sticker_code = ?",
        [stickerCode]
      );
      if (!order) throw new Error("Failed to create bag order");

      await q(
        "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values (?, ?, ?, ?)",
        [order.id, body.primaryBatchId, body.primaryMetal, body.primaryWeightGrams]
      );

      if (body.secondBatchId && body.secondMetal && body.secondWeightGrams) {
        const second = await one<{ id: string; remaining_grams: number }>(
          "select id, remaining_grams from inventory_batches where id = ?",
          [body.secondBatchId]
        );
        if (!second) throw new Error("Second batch missing");
        if (Number(second.remaining_grams) < body.secondWeightGrams) {
          throw new Error("Insufficient second batch grams");
        }
        await q(
          "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values (?, ?, ?, ?)",
          [order.id, body.secondBatchId, body.secondMetal, body.secondWeightGrams]
        );
        await q("update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
          body.secondWeightGrams,
          body.secondBatchId
        ]);
      }

      await q("update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
        body.primaryWeightGrams,
        body.primaryBatchId
      ]);
      await q("commit");
      return one("select * from bag_orders where sticker_code = ?", [stickerCode]);
    } catch (e) {
      await q("rollback");
      throw e;
    }
  });

  app.delete("/v1/bag-orders/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const comps = await q<{ batch_id: string; weight_grams: number }>(
      "select batch_id, weight_grams from bag_order_components where bag_order_id = ?",
      [id]
    );
    await q("begin");
    try {
      for (const c of comps) {
        await q("update inventory_batches set remaining_grams = remaining_grams + ? where id = ?", [
          c.weight_grams,
          c.batch_id
        ]);
      }
      await q("delete from bag_orders where id = ?", [id]);
      await q("commit");
    } catch (e) {
      await q("rollback");
      throw e;
    }
    return { ok: true };
  });
}
