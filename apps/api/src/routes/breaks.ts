import type { Transaction } from "@libsql/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createBreakSchema, processBreakSpotSchema, updateBreakSchema } from "@gold/shared";
import { one, q, txOne, txQ, withWriteTx } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

const OZT_TO_GRAMS = 31.1034768;

type Metal = "gold" | "silver";

async function assertStreamAccess(
  req: FastifyRequest,
  streamId: string
): Promise<void> {
  const stream = await one<{ user_id: string; ended_at: string | null }>(
    "select user_id, ended_at from streams where id = ?",
    [streamId]
  );
  if (!stream) throw req.server.httpErrors.notFound("Stream not found");
  const self = req.authUser?.sub;
  const isAdmin = req.authUser?.role === "admin";
  if (!isAdmin && stream.user_id !== self) throw req.server.httpErrors.forbidden();
  if (stream.ended_at) throw req.server.httpErrors.conflict("Stream is not live");
}

async function readPoolAverages(
  tx: Transaction,
  metal: Metal
): Promise<{ gramsOnHand: number; totalCostOnHand: number; avgCostPerGram: number }> {
  const row = await txOne<{ grams_on_hand: number; total_cost_on_hand: number }>(
    tx,
    "select grams_on_hand, total_cost_on_hand from metal_inventory_pool where metal = ?",
    [metal]
  );
  if (!row) throw new Error(`Missing ${metal} pool`);
  const gramsOnHand = Number(row.grams_on_hand);
  const totalCostOnHand = Number(row.total_cost_on_hand);
  const avgCostPerGram = gramsOnHand > 0 ? totalCostOnHand / gramsOnHand : 0;
  return { gramsOnHand, totalCostOnHand, avgCostPerGram };
}

async function consumeMetalFromBatches(tx: Transaction, metal: Metal, gramsNeeded: number): Promise<void> {
  let remaining = gramsNeeded;
  const batches = await txQ<{ id: string; remaining_grams: number }>(
    tx,
    `select id, remaining_grams
     from inventory_batches
     where metal = ? and remaining_grams > 0
     order by date asc, created_at asc, id asc`,
    [metal]
  );
  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.remaining_grams);
    const take = Math.min(available, remaining);
    if (take <= 0) continue;
    await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams - ? where id = ?", [
      take,
      batch.id
    ]);
    remaining -= take;
  }
  if (remaining > 0.0000001) {
    throw new Error(`Insufficient ${metal} inventory for ${gramsNeeded.toFixed(4)}g`);
  }
}

async function upsertBreakPrizeSlots(
  tx: Transaction,
  breakId: string,
  slots: Array<{ slotNumber: number; slotType: "normal" | "mega"; metal: "gold" | "silver"; grams: number; cost: number }>
) {
  await txQ(tx, "delete from break_prize_slots where break_id = ? and is_consumed = 0", [breakId]);
  for (const slot of slots) {
    await txQ(
      tx,
      `insert into break_prize_slots (break_id, slot_number, slot_type, metal, grams, cost, is_consumed)
       values (?, ?, ?, ?, ?, ?, 0)`,
      [breakId, slot.slotNumber, slot.slotType, slot.metal, slot.grams, slot.cost]
    );
  }
}

export async function registerBreakRoutes(app: FastifyInstance) {
  app.get("/v1/breaks", { preHandler: requireAuth }, async () => {
    return q(
      `select id, name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots,
              total_silver_budget_grams, remaining_silver_grams, created_at, updated_at
       from breaks
       order by created_at desc`
    );
  });

  app.get("/v1/breaks/:id", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const brk = await one(
      `select id, name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots,
              total_silver_budget_grams, remaining_silver_grams, created_at, updated_at
       from breaks where id = ?`,
      [id]
    );
    if (!brk) return req.server.httpErrors.notFound("Break not found");
    const prizeSlots = await q(
      `select id, break_id, slot_number, slot_type, metal, grams, cost, is_consumed, consumed_at
       from break_prize_slots where break_id = ? order by slot_number asc`,
      [id]
    );
    const spots = await q(
      `select id, break_id, spot_number, outcome_type, prize_slot_id, metal, grams, cost, processed_at
       from break_spots where break_id = ? order by spot_number asc`,
      [id]
    );
    return { ...brk, prizeSlots, spots };
  });

  app.post("/v1/breaks", { preHandler: requireRole("admin") }, async (req) => {
    const body = createBreakSchema.parse(req.body);
    return withWriteTx(async (tx) => {
      await txQ(
        tx,
        `insert into breaks (name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots, total_silver_budget_grams, remaining_silver_grams)
         values (?, 'draft', 50, 40, 0, 0, 40, 40)`,
        [body.name.trim()]
      );
      const created = await txOne<{ id: string }>(tx, "select id from breaks order by rowid desc limit 1");
      if (!created) throw new Error("Failed to create break");

      await upsertBreakPrizeSlots(tx, created.id, body.prizeSlots);
      for (let spotNumber = 1; spotNumber <= 50; spotNumber += 1) {
        await txQ(tx, "insert into break_spots (break_id, spot_number) values (?, ?)", [created.id, spotNumber]);
      }
      return txOne(
        tx,
        `select id, name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots,
                total_silver_budget_grams, remaining_silver_grams, created_at, updated_at
         from breaks where id = ?`,
        [created.id]
      );
    });
  });

  app.patch("/v1/breaks/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateBreakSchema.parse(req.body);
    return withWriteTx(async (tx) => {
      const existing = await txOne<{ id: string; sold_spots: number }>(
        tx,
        "select id, sold_spots from breaks where id = ?",
        [id]
      );
      if (!existing) throw req.server.httpErrors.notFound("Break not found");
      if (Number(existing.sold_spots) > 0) {
        throw req.server.httpErrors.conflict("Cannot edit break after spots are sold");
      }
      await txQ(tx, "update breaks set name = ?, status = coalesce(?, status), updated_at = datetime('now') where id = ?", [
        body.name.trim(),
        body.status ?? null,
        id
      ]);
      await upsertBreakPrizeSlots(tx, id, body.prizeSlots);
      return txOne(
        tx,
        `select id, name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots,
                total_silver_budget_grams, remaining_silver_grams, created_at, updated_at
         from breaks where id = ?`,
        [id]
      );
    });
  });

  app.post("/v1/streams/:id/breaks/start", { preHandler: requireAuth }, async (req) => {
    const { id: streamId } = req.params as { id: string };
    await assertStreamAccess(req, streamId);
    const body = (req.body ?? {}) as { breakId: string };
    if (!body.breakId) return req.server.httpErrors.badRequest("breakId is required");

    return withWriteTx(async (tx) => {
      const active = await txOne<{ id: string }>(
        tx,
        "select id from stream_breaks where stream_id = ? and ended_at is null",
        [streamId]
      );
      if (active) return txOne(tx, "select * from stream_breaks where id = ?", [active.id]);

      const brk = await txOne<{ id: string; status: string; sold_prize_spots: number }>(
        tx,
        "select id, status, sold_prize_spots from breaks where id = ?",
        [body.breakId]
      );
      if (!brk) throw req.server.httpErrors.notFound("Break not found");
      if (Number(brk.sold_prize_spots) >= 10) throw req.server.httpErrors.conflict("Break is already completed");

      await txQ(tx, "insert into stream_breaks (stream_id, break_id) values (?, ?)", [streamId, body.breakId]);
      await txQ(tx, "update breaks set status = 'active', updated_at = datetime('now') where id = ?", [body.breakId]);
      return txOne(
        tx,
        `select sb.id, sb.stream_id, sb.break_id, sb.started_at, sb.ended_at, sb.ended_reason,
                b.name as break_name, b.remaining_silver_grams, b.sold_prize_spots
         from stream_breaks sb
         join breaks b on b.id = sb.break_id
         where sb.stream_id = ?`,
        [streamId]
      );
    });
  });

  app.get("/v1/streams/:id/break", { preHandler: requireAuth }, async (req) => {
    const { id: streamId } = req.params as { id: string };
    await assertStreamAccess(req, streamId);
    const streamBreak = await one<{
      id: string;
      stream_id: string;
      break_id: string;
      started_at: string;
      ended_at: string | null;
      ended_reason: string | null;
      break_name: string;
      remaining_silver_grams: number;
      sold_prize_spots: number;
      sold_spots: number;
    }>(
      `select sb.id, sb.stream_id, sb.break_id, sb.started_at, sb.ended_at, sb.ended_reason,
              b.name as break_name, b.remaining_silver_grams, b.sold_prize_spots, b.sold_spots
       from stream_breaks sb
       join breaks b on b.id = sb.break_id
       where sb.stream_id = ? and sb.ended_at is null`,
      [streamId]
    );
    if (!streamBreak) return { streamBreak: null };
    const spots = await q(
      `select id, break_id, spot_number, outcome_type, prize_slot_id, metal, grams, cost, processed_at
       from break_spots where break_id = ? order by spot_number asc`,
      [streamBreak.break_id]
    );
    const prizeSlots = await q(
      `select id, break_id, slot_number, slot_type, metal, grams, cost, is_consumed, consumed_at
       from break_prize_slots where break_id = ? order by slot_number asc`,
      [streamBreak.break_id]
    );
    return { streamBreak, spots, prizeSlots };
  });

  app.post("/v1/streams/:id/breaks/:streamBreakId/process-spot", { preHandler: requireAuth }, async (req) => {
    const { id: streamId, streamBreakId } = req.params as { id: string; streamBreakId: string };
    await assertStreamAccess(req, streamId);
    const parsed = processBreakSpotSchema.safeParse({
      ...(req.body as Record<string, unknown>),
      streamId,
      streamBreakId
    });
    if (!parsed.success) {
      return req.server.httpErrors.badRequest("Invalid break spot payload");
    }
    const body = parsed.data;

    return withWriteTx(async (tx) => {
      const sb = await txOne<{ id: string; break_id: string }>(
        tx,
        "select id, break_id from stream_breaks where id = ? and stream_id = ? and ended_at is null",
        [streamBreakId, streamId]
      );
      if (!sb) throw req.server.httpErrors.notFound("Active stream break not found");

      const brk = await txOne<{ id: string; name: string; sold_prize_spots: number; remaining_silver_grams: number }>(
        tx,
        "select id, name, sold_prize_spots, remaining_silver_grams from breaks where id = ?",
        [sb.break_id]
      );
      if (!brk) throw req.server.httpErrors.notFound("Break not found");

      const nextSpot = await txOne<{ id: string; spot_number: number }>(
        tx,
        `select id, spot_number
         from break_spots
         where break_id = ? and processed_at is null
         order by spot_number asc
         limit 1`,
        [brk.id]
      );
      if (!nextSpot) throw req.server.httpErrors.conflict("All 50 spots have already been processed");

      let metal: Metal;
      let grams: number;
      let spotCost = 0;
      let prizeSlotId: string | null = null;

      if (body.outcomeType === "silver") {
        metal = "silver";
        grams = 1;
        if (Number(brk.remaining_silver_grams) < grams) {
          throw req.server.httpErrors.conflict("No silver grams remaining for this break");
        }
        const pool = await readPoolAverages(tx, metal);
        if (pool.gramsOnHand < grams) throw req.server.httpErrors.conflict("Insufficient silver inventory");
        spotCost = pool.avgCostPerGram * grams;
      } else {
        const slot = await txOne<{
          id: string;
          metal: Metal;
          grams: number;
          cost: number;
          is_consumed: number;
        }>(
          tx,
          `select id, metal, grams, cost, is_consumed
           from break_prize_slots
           where id = ? and break_id = ?`,
          [body.prizeSlotId!, brk.id]
        );
        if (!slot) throw req.server.httpErrors.notFound("Prize slot not found for this break");
        if (Number(slot.is_consumed) === 1) throw req.server.httpErrors.conflict("Prize slot already consumed");
        metal = slot.metal;
        grams = Number(slot.grams);
        spotCost = Number(slot.cost);
        prizeSlotId = slot.id;
      }

      await consumeMetalFromBatches(tx, metal, grams);

      if (body.outcomeType === "prize" && prizeSlotId) {
        await txQ(
          tx,
          "update break_prize_slots set is_consumed = 1, consumed_at = datetime('now'), updated_at = datetime('now') where id = ?",
          [prizeSlotId]
        );
      }

      await txQ(
        tx,
        `update break_spots
         set outcome_type = ?, prize_slot_id = ?, metal = ?, grams = ?, cost = ?, processed_at = datetime('now')
         where id = ?`,
        [body.outcomeType, prizeSlotId, metal, grams, spotCost, nextSpot.id]
      );

      await txQ(
        tx,
        `update breaks
         set sold_spots = sold_spots + 1,
             sold_prize_spots = sold_prize_spots + ?,
             remaining_silver_grams = case when ? = 'silver' then max(0, remaining_silver_grams - 1) else remaining_silver_grams end,
             updated_at = datetime('now')
         where id = ?`,
        [body.outcomeType === "prize" ? 1 : 0, body.outcomeType, brk.id]
      );

      const breakAfter = await txOne<{ sold_prize_spots: number; remaining_silver_grams: number }>(
        tx,
        "select sold_prize_spots, remaining_silver_grams from breaks where id = ?",
        [brk.id]
      );
      const spotPrice = grams > 0 ? (spotCost / grams) * OZT_TO_GRAMS : 0;

      await txQ(
        tx,
        `insert into stream_items (stream_id, sale_type, name, metal, weight_grams, spot_value, spot_price, batch_id, break_id, break_spot_id)
         values (?, 'raw', ?, ?, ?, ?, ?, null, ?, ?)`,
        [
          streamId,
          `Spot #${nextSpot.spot_number}`,
          metal,
          grams,
          spotCost,
          spotPrice,
          brk.id,
          nextSpot.id
        ]
      );

      if (Number(breakAfter?.sold_prize_spots ?? 0) >= 10) {
        await txQ(
          tx,
          "update stream_breaks set ended_at = datetime('now'), ended_reason = 'all_prizes_sold' where id = ?",
          [streamBreakId]
        );
        await txQ(tx, "update breaks set status = 'completed', updated_at = datetime('now') where id = ?", [brk.id]);
      }

      return {
        ok: true,
        breakId: brk.id,
        spotNumber: nextSpot.spot_number,
        outcomeType: body.outcomeType,
        soldPrizeSpots: Number(breakAfter?.sold_prize_spots ?? 0),
        remainingSilverGrams: Number(breakAfter?.remaining_silver_grams ?? 0)
      };
    });
  });
}
