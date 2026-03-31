import type { FastifyInstance } from "fastify";
import { createRawSaleSchema, createStickerSaleSchema } from "@gold/shared";
import { db } from "../db.js";

const OZT_TO_GRAMS = 31.1034768;

async function getLatestSpot(metal: "gold" | "silver") {
  const { data, error } = await db
    .from("spot_snapshots")
    .select("*")
    .eq("metal", metal)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw error ?? new Error(`No ${metal} spot`);
  return Number(data.price);
}

export async function registerStreamRoutes(app: FastifyInstance) {
  app.get("/v1/streams", async (req) => {
    const { userId } = req.query as { userId?: string };
    let query = db.from("streams").select("*").order("started_at", { ascending: false });
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  });

  app.post("/v1/streams/start", async (req) => {
    const body = req.body as {
      userId: string;
      goldBatchId?: string | null;
      silverBatchId?: string | null;
    };
    const { data, error } = await db
      .from("streams")
      .insert({
        user_id: body.userId,
        gold_batch_id: body.goldBatchId ?? null,
        silver_batch_id: body.silverBatchId ?? null
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

  app.post("/v1/streams/:id/end", async (req) => {
    const { id } = req.params as { id: string };
    const { error } = await db
      .from("streams")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

  app.post("/v1/streams/sticker-sale", async (req) => {
    const body = createStickerSaleSchema.parse(req.body);
    const order = await db
      .from("bag_orders")
      .select("*,bag_order_components(*)")
      .eq("sticker_code", body.stickerCode.toUpperCase())
      .single();
    if (order.error || !order.data) throw order.error ?? new Error("Unknown sticker");

    const existing = await db
      .from("stream_items")
      .select("id")
      .eq("sale_type", "sticker")
      .eq("sticker_code", body.stickerCode.toUpperCase())
      .limit(1);
    if ((existing.data ?? []).length > 0) throw new Error("Sticker already sold");

    const components = order.data.bag_order_components ?? [];
    let totalWeight = 0;
    let totalSpotValue = 0;
    for (const c of components) {
      const spot = await getLatestSpot(c.metal);
      totalWeight += Number(c.weight_grams);
      totalSpotValue += Number(c.weight_grams) * (spot / OZT_TO_GRAMS);
    }
    const spotPrice = totalWeight ? (totalSpotValue / totalWeight) * OZT_TO_GRAMS : 0;

    const { data, error } = await db
      .from("stream_items")
      .insert({
        stream_id: body.streamId,
        sale_type: "sticker",
        name: body.stickerCode.toUpperCase(),
        metal: order.data.metal,
        weight_grams: totalWeight,
        spot_value: totalSpotValue,
        spot_price: spotPrice,
        sticker_code: body.stickerCode.toUpperCase(),
        batch_id: order.data.primary_batch_id
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

  app.post("/v1/streams/raw-sale", async (req) => {
    const body = createRawSaleSchema.parse(req.body);
    const stream = await db.from("streams").select("*").eq("id", body.streamId).single();
    if (stream.error || !stream.data) throw stream.error ?? new Error("Stream missing");
    const batchId =
      body.metal === "gold" ? stream.data.gold_batch_id : stream.data.silver_batch_id;
    if (!batchId) throw new Error(`No active ${body.metal} batch selected`);

    const batch = await db.from("inventory_batches").select("*").eq("id", batchId).single();
    if (batch.error || !batch.data) throw batch.error ?? new Error("Batch missing");
    if (Number(batch.data.remaining_grams) < body.weightGrams) {
      throw new Error("Insufficient remaining grams");
    }

    const spot = await getLatestSpot(body.metal);
    const spotValue = body.weightGrams * (spot / OZT_TO_GRAMS);
    const { data, error } = await db
      .from("stream_items")
      .insert({
        stream_id: body.streamId,
        sale_type: "raw",
        name: `Raw ${body.weightGrams}g ${body.metal}`,
        metal: body.metal,
        weight_grams: body.weightGrams,
        spot_value: spotValue,
        spot_price: spot,
        batch_id: batchId
      })
      .select("*")
      .single();
    if (error) throw error;

    await db
      .from("inventory_batches")
      .update({
        remaining_grams: Number(batch.data.remaining_grams) - body.weightGrams
      })
      .eq("id", batchId);

    return data;
  });

  app.delete("/v1/streams/items/:id", async (req) => {
    const { id } = req.params as { id: string };
    const item = await db.from("stream_items").select("*").eq("id", id).single();
    if (item.error || !item.data) throw item.error ?? new Error("Item not found");

    if (item.data.sale_type === "raw" && item.data.batch_id) {
      const batch = await db
        .from("inventory_batches")
        .select("*")
        .eq("id", item.data.batch_id)
        .single();
      if (!batch.error && batch.data) {
        await db
          .from("inventory_batches")
          .update({
            remaining_grams:
              Number(batch.data.remaining_grams) + Number(item.data.weight_grams)
          })
          .eq("id", item.data.batch_id);
      }
    }

    const { error } = await db.from("stream_items").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
