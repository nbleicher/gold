import type { FastifyInstance } from "fastify";
import { createBagOrderSchema } from "@gold/shared";
import { db } from "../db.js";
import { getTierIndex, seqFromIndex } from "../domain/tiers.js";

export async function registerBagOrderRoutes(app: FastifyInstance) {
  app.get("/v1/bag-orders", async () => {
    const { data, error } = await db
      .from("bag_orders")
      .select("*,bag_order_components(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

  app.post("/v1/bag-orders", async (req) => {
    const body = createBagOrderSchema.parse(req.body);
    const primary = await db
      .from("inventory_batches")
      .select("*")
      .eq("id", body.primaryBatchId)
      .single();
    if (primary.error || !primary.data) throw primary.error ?? new Error("Batch missing");
    if (Number(primary.data.remaining_grams) < body.primaryWeightGrams) {
      throw new Error("Insufficient primary batch grams");
    }

    const totalWeight = body.primaryWeightGrams + (body.secondWeightGrams ?? 0);
    const tierIndex = getTierIndex(totalWeight);
    if (!tierIndex) throw new Error("Weight does not match tier");

    const { count } = await db
      .from("bag_orders")
      .select("*", { count: "exact", head: true })
      .eq("primary_batch_id", body.primaryBatchId)
      .eq("tier_index", tierIndex);
    const stickerCode =
      `${primary.data.sticker_batch_letter}${tierIndex}${seqFromIndex(count ?? 0)}`.toUpperCase();

    const { data: order, error: orderErr } = await db
      .from("bag_orders")
      .insert({
        primary_batch_id: body.primaryBatchId,
        metal: body.secondWeightGrams ? "mixed" : body.primaryMetal,
        actual_weight_grams: totalWeight,
        tier_index: tierIndex,
        sticker_code: stickerCode
      })
      .select("*")
      .single();
    if (orderErr || !order) throw orderErr ?? new Error("Failed to create bag order");

    const comps = [
      {
        bag_order_id: order.id,
        batch_id: body.primaryBatchId,
        metal: body.primaryMetal,
        weight_grams: body.primaryWeightGrams
      }
    ];

    if (body.secondBatchId && body.secondMetal && body.secondWeightGrams) {
      const second = await db
        .from("inventory_batches")
        .select("*")
        .eq("id", body.secondBatchId)
        .single();
      if (second.error || !second.data) throw second.error ?? new Error("Second batch missing");
      if (Number(second.data.remaining_grams) < body.secondWeightGrams) {
        throw new Error("Insufficient second batch grams");
      }
      comps.push({
        bag_order_id: order.id,
        batch_id: body.secondBatchId,
        metal: body.secondMetal,
        weight_grams: body.secondWeightGrams
      });
      await db
        .from("inventory_batches")
        .update({
          remaining_grams: Number(second.data.remaining_grams) - body.secondWeightGrams
        })
        .eq("id", body.secondBatchId);
    }

    const compInsert = await db.from("bag_order_components").insert(comps);
    if (compInsert.error) throw compInsert.error;

    await db
      .from("inventory_batches")
      .update({
        remaining_grams: Number(primary.data.remaining_grams) - body.primaryWeightGrams
      })
      .eq("id", body.primaryBatchId);

    return order;
  });

  app.delete("/v1/bag-orders/:id", async (req) => {
    const { id } = req.params as { id: string };
    const comps = await db
      .from("bag_order_components")
      .select("*")
      .eq("bag_order_id", id);
    if (comps.error) throw comps.error;
    for (const c of comps.data ?? []) {
      const batch = await db.from("inventory_batches").select("*").eq("id", c.batch_id).single();
      if (!batch.error && batch.data) {
        await db
          .from("inventory_batches")
          .update({
            remaining_grams: Number(batch.data.remaining_grams) + Number(c.weight_grams)
          })
          .eq("id", c.batch_id);
      }
    }
    const { error } = await db.from("bag_orders").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
