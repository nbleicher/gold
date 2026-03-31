import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/v1/inventory/batches", async () => {
    const { data, error } = await db
      .from("inventory_batches")
      .select("*")
      .order("date", { ascending: false });
    if (error) throw error;
    return data;
  });

  app.post("/v1/inventory/batches", async (req) => {
    const body = req.body as {
      date: string;
      metal: "gold" | "silver";
      grams: number;
      purchaseSpot: number;
      totalCost: number;
    };
    const { data, error } = await db
      .from("inventory_batches")
      .insert({
        date: body.date,
        metal: body.metal,
        grams: body.grams,
        remaining_grams: body.grams,
        purchase_spot: body.purchaseSpot,
        total_cost: body.totalCost
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

  app.patch("/v1/inventory/batches/:id/code", async (req) => {
    const { id } = req.params as { id: string };
    const { stickerBatchLetter } = req.body as { stickerBatchLetter: string };
    const { data, error } = await db
      .from("inventory_batches")
      .update({ sticker_batch_letter: stickerBatchLetter.toUpperCase() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

  app.delete("/v1/inventory/batches/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { error } = await db.from("inventory_batches").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
