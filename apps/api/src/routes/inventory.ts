import type { FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { one, q } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

function msSince(t0: number): number {
  return Math.round((performance.now() - t0) * 100) / 100;
}

function suggestStickerLetterFromUsedLetters(usedLettersCsv: string | null): string {
  const used = new Set<string>();
  if (usedLettersCsv) {
    for (const part of usedLettersCsv.split(",")) {
      const L = String(part).trim().toUpperCase().slice(0, 1);
      if (L) used.add(L);
    }
  }
  for (let c = 65; c <= 90; c++) {
    const L = String.fromCharCode(c);
    if (!used.has(L)) return L;
  }
  return "X";
}

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get("/v1/inventory/batches", { preHandler: requireAuth }, async () => {
    return q(
      "select id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at from inventory_batches order by date desc"
    );
  });

  app.post("/v1/inventory/batches", { preHandler: requireRole("admin") }, async (req) => {
    const t0 = performance.now();
    const body = req.body as {
      date: string;
      metal: "gold" | "silver";
      grams: number;
      purchaseSpot?: number | null;
      totalCost: number;
    };

    const plan = await one<{ n: number; used_letters: string | null }>(
      `select
         (select count(*) from inventory_batches where metal = ?) as n,
         (select group_concat(upper(sticker_batch_letter), ',') from inventory_batches where metal = ?) as used_letters`,
      [body.metal, body.metal]
    );
    const planMs = msSince(t0);

    const batchNumber = Number(plan?.n ?? 0) + 1;
    const label = body.metal === "gold" ? "Gold" : "Silver";
    const batchName = `${label} Batch #${batchNumber}`;
    const stickerBatchLetter = suggestStickerLetterFromUsedLetters(plan?.used_letters ?? null);

    const tIns = performance.now();
    const row = await one<{
      id: string;
      date: string;
      metal: string;
      grams: number;
      remaining_grams: number;
      purchase_spot: number;
      total_cost: number;
      batch_number: number;
      batch_name: string;
      sticker_batch_letter: string;
      created_at: string;
    }>(
      `insert into inventory_batches (date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       returning id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at`,
      [
        body.date,
        body.metal,
        body.grams,
        body.grams,
        body.purchaseSpot == null || !Number.isFinite(Number(body.purchaseSpot))
          ? null
          : Number(body.purchaseSpot),
        body.totalCost,
        batchNumber,
        batchName,
        stickerBatchLetter
      ]
    );
    const insertMs = msSince(tIns);
    req.log.info(
      {
        route: "POST /v1/inventory/batches",
        planMs,
        insertMs,
        totalMs: msSince(t0)
      },
      "inventory batch create timing"
    );
    return row;
  });

  app.patch("/v1/inventory/batches/:id/code", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const { stickerBatchLetter } = req.body as { stickerBatchLetter: string };
    const L = String(stickerBatchLetter ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 1);
    if (!L || L < "A" || L > "Z") throw new Error("Use letters A–Z");

    const batch = await one<{ id: string; metal: string }>("select id, metal from inventory_batches where id = ?", [
      id
    ]);
    if (!batch) throw new Error("Batch not found");

    const conflict = await one<{ id: string }>(
      "select id from inventory_batches where metal = ? and id != ? and upper(sticker_batch_letter) = ? limit 1",
      [batch.metal, id, L]
    );
    if (conflict) throw new Error("That letter is already used for this metal");

    await q("update inventory_batches set sticker_batch_letter = ? where id = ?", [L, id]);
    return one(
      "select id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at from inventory_batches where id = ?",
      [id]
    );
  });

  app.delete("/v1/inventory/batches/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const compCount = await one<{ n: number }>(
      "select count(*) as n from bag_order_components where batch_id = ?",
      [id]
    );
    const primaryCount = await one<{ n: number }>(
      "select count(*) as n from bag_orders where primary_batch_id = ?",
      [id]
    );
    if (Number(compCount?.n ?? 0) > 0 || Number(primaryCount?.n ?? 0) > 0) {
      throw new Error("Cannot delete batch: bag orders still reference it");
    }
    const sCount = await one<{ n: number }>(
      "select count(*) as n from streams where gold_batch_id = ? or silver_batch_id = ?",
      [id, id]
    );
    if (Number(sCount?.n ?? 0) > 0) {
      throw new Error("Cannot delete batch: streams still reference it");
    }

    await q("delete from inventory_batches where id = ?", [id]);
    return { ok: true };
  });

  /** Weighted pool averages by metal (for break template row cost estimates). */
  app.get("/v1/inventory/metal-pool", { preHandler: requireAuth }, async () => {
    const rows = await q<{ metal: string; grams_on_hand: number; total_cost_on_hand: number }>(
      "select metal, grams_on_hand, total_cost_on_hand from metal_inventory_pool where metal in ('gold','silver')"
    );
    const out: Record<string, { gramsOnHand: number; avgCostPerGram: number }> = {};
    for (const r of rows) {
      const g = Number(r.grams_on_hand);
      const c = Number(r.total_cost_on_hand);
      out[r.metal] = {
        gramsOnHand: g,
        avgCostPerGram: g > 0 ? c / g : 0
      };
    }
    return {
      gold: out.gold ?? { gramsOnHand: 0, avgCostPerGram: 0 },
      silver: out.silver ?? { gramsOnHand: 0, avgCostPerGram: 0 }
    };
  });
}
