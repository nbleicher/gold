import type { FastifyInstance } from "fastify";
import { createBagOrderSchema, type CreateBagOrderInput } from "@gold/shared";
import {
  METAL_POOL_COST_BASIS_METHOD,
  VIRTUAL_POOL_BATCH_IDS,
  virtualPoolBatchIdForMetal
} from "../domain/bagPool.js";
import { getTierIndex, seqFromIndex } from "../domain/tiers.js";
import { one, q, txOne, txQ, withWriteTx } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

type AllocationLine = { batchId: string; metal: "gold" | "silver"; weightGrams: number };

async function readMetalPoolAverage(metal: "gold" | "silver"): Promise<number> {
  const row = await one<{ grams_on_hand: number; total_cost_on_hand: number }>(
    "select grams_on_hand, total_cost_on_hand from metal_inventory_pool where metal = ?",
    [metal]
  );
  const grams = Number(row?.grams_on_hand ?? 0);
  const cost = Number(row?.total_cost_on_hand ?? 0);
  if (!(grams > 0)) return 0;
  return cost / grams;
}

async function allocateMetalFromPool(
  tx: Parameters<typeof txQ>[0],
  metal: "gold" | "silver",
  weightGrams: number
): Promise<AllocationLine[]> {
  const batches = await txQ<{ id: string; remaining_grams: number }>(
    tx,
    `select id, remaining_grams
     from inventory_batches
     where metal = ?
       and is_virtual_pool = 0
       and remaining_grams > 0
     order by created_at asc, id asc`,
    [metal]
  );

  let remaining = weightGrams;
  const lines: AllocationLine[] = [];
  for (const batch of batches) {
    if (!(remaining > 0)) break;
    const available = Number(batch.remaining_grams);
    if (!(available > 0)) continue;
    const take = Math.min(available, remaining);
    lines.push({ batchId: batch.id, metal, weightGrams: take });
    remaining -= take;
  }

  if (remaining > 0.0000001) {
    throw new Error(`Insufficient ${metal} inventory for bag`);
  }

  return lines;
}

export async function createBagOrderFromInput(body: CreateBagOrderInput) {
  const totalWeight = body.primaryWeightGrams + (body.secondWeightGrams ?? 0);
  const tierIndex = getTierIndex(totalWeight);
  if (!tierIndex) throw new Error("Weight does not match tier");

  const primaryPoolBatchId = virtualPoolBatchIdForMetal(body.primaryMetal);
  const poolBatch = await one<{ id: string; sticker_batch_letter: string }>(
    "select id, sticker_batch_letter from inventory_batches where id = ? and is_virtual_pool = 1",
    [primaryPoolBatchId]
  );
  if (!poolBatch) throw new Error("Metal pool batch missing");

  const countRow = await one<{ count: number }>(
    "select count(*) as count from bag_orders where primary_batch_id = ? and tier_index = ?",
    [primaryPoolBatchId, tierIndex]
  );
  const stickerCode =
    `${poolBatch.sticker_batch_letter}${tierIndex}${seqFromIndex(countRow?.count ?? 0)}`.toUpperCase();

  const primaryAvg = await readMetalPoolAverage(body.primaryMetal);
  const secondAvg =
    body.secondMetal && body.secondWeightGrams
      ? await readMetalPoolAverage(body.secondMetal)
      : 0;
  const costBasisUsd = body.primaryWeightGrams * primaryAvg + (body.secondWeightGrams ?? 0) * secondAvg;
  const costBasisPerGram = totalWeight > 0 ? costBasisUsd / totalWeight : 0;

  return withWriteTx(async (tx) => {
    const primaryAllocations = await allocateMetalFromPool(tx, body.primaryMetal, body.primaryWeightGrams);
    const secondAllocations =
      body.secondMetal && body.secondWeightGrams
        ? await allocateMetalFromPool(tx, body.secondMetal, body.secondWeightGrams)
        : [];

    await txQ(
      tx,
      `insert into bag_orders (
         primary_batch_id,
         metal,
         actual_weight_grams,
         tier_index,
         sticker_code,
         cost_basis_method,
         cost_basis_usd,
         cost_basis_per_gram
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        primaryPoolBatchId,
        body.secondWeightGrams ? "mixed" : body.primaryMetal,
        totalWeight,
        tierIndex,
        stickerCode,
        METAL_POOL_COST_BASIS_METHOD,
        costBasisUsd,
        costBasisPerGram
      ]
    );

    const order = await txOne<{ id: string }>(
      tx,
      "select id from bag_orders where sticker_code = ?",
      [stickerCode]
    );
    if (!order) throw new Error("Failed to create bag order");

    for (const line of [...primaryAllocations, ...secondAllocations]) {
      await txQ(
        tx,
        "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values (?, ?, ?, ?)",
        [order.id, line.batchId, line.metal, line.weightGrams]
      );
      await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
        line.weightGrams,
        line.batchId
      ]);
    }

    return txOne(tx, "select * from bag_orders where sticker_code = ?", [stickerCode]);
  });
}

export async function registerBagOrderRoutes(app: FastifyInstance) {
  app.get("/v1/bag-orders", { preHandler: requireAuth }, async () => {
    const orders = await q<Record<string, unknown>>(
      `select id, primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code, created_at, sold_at,
              cost_basis_method, cost_basis_usd, cost_basis_per_gram
       from bag_orders order by created_at desc`
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
    try {
      const row = await createBagOrderFromInput(parsed.data);
      return row;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bag order failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.post("/v1/bag-orders/_legacy-create", { preHandler: requireRole("admin") }, async (req, reply) => {
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
    try {
      const row = await createBagOrderFromInput(parsed.data);
      return row;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bag order failed";
      return reply.status(400).send({ error: msg });
    }
  });

  app.patch("/v1/bag-orders/:id/mark-sold", { preHandler: requireRole("admin") }, async (req) => {
    return req.server.httpErrors.gone("Bag sale mutation is deprecated. Use break stream flow.");
  });

  app.delete("/v1/bag-orders/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const order = await one<{ id: string; sold_at: string | null; sticker_code: string | null }>(
      "select id, sold_at, sticker_code from bag_orders where id = ?",
      [id]
    );
    if (!order) {
      return req.server.httpErrors.notFound("Bag order not found");
    }

    const soldBySticker = order.sticker_code
      ? await one<{ id: string }>(
          "select id from stream_items where sale_type = 'sticker' and upper(sticker_code) = ? limit 1",
          [String(order.sticker_code).toUpperCase()]
        )
      : null;
    if (order.sold_at || soldBySticker) {
      return req.server.httpErrors.conflict("Sold bag orders cannot be removed");
    }

    return withWriteTx(async (tx) => {
      const components = await txQ<{ batch_id: string; weight_grams: number }>(
        tx,
        "select batch_id, weight_grams from bag_order_components where bag_order_id = ?",
        [id]
      );
      if (!components.length) {
        throw new Error("Bag order has no components");
      }

      for (const component of components) {
        const batch = await txOne<{ id: string }>(
          tx,
          "select id from inventory_batches where id = ?",
          [component.batch_id]
        );
        if (!batch) {
          throw new Error(`Inventory batch missing for component: ${component.batch_id}`);
        }
        await txQ(
          tx,
          "update inventory_batches set remaining_grams = remaining_grams + ? where id = ?",
          [Number(component.weight_grams), component.batch_id]
        );
      }

      await txQ(tx, "delete from bag_order_components where bag_order_id = ?", [id]);
      await txQ(tx, "delete from bag_orders where id = ?", [id]);
      return { ok: true, id, restoredComponents: components.length };
    });
  });
}

export { VIRTUAL_POOL_BATCH_IDS };
