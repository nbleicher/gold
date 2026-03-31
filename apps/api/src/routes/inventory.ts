import type { FastifyInstance } from "fastify";
import { one, q } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/v1/inventory/batches", { preHandler: requireAuth }, async () => {
    return q(
      "select id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at from inventory_batches order by date desc"
    );
  });

  app.post("/v1/inventory/batches", { preHandler: requireRole("admin") }, async (req) => {
    const body = req.body as {
      date: string;
      metal: "gold" | "silver";
      grams: number;
      purchaseSpot: number;
      totalCost: number;
    };
    await q(
      "insert into inventory_batches (date, metal, grams, remaining_grams, purchase_spot, total_cost) values (?, ?, ?, ?, ?, ?)",
      [body.date, body.metal, body.grams, body.grams, body.purchaseSpot, body.totalCost]
    );
    return one(
      "select id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at from inventory_batches order by rowid desc limit 1"
    );
  });

  app.patch("/v1/inventory/batches/:id/code", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const { stickerBatchLetter } = req.body as { stickerBatchLetter: string };
    await q("update inventory_batches set sticker_batch_letter = ? where id = ?", [
      stickerBatchLetter.toUpperCase(),
      id
    ]);
    return one(
      "select id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at from inventory_batches where id = ?",
      [id]
    );
  });

  app.delete("/v1/inventory/batches/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from inventory_batches where id = ?", [id]);
    return { ok: true };
  });
}
