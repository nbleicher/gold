import type { FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";
import { z } from "zod";
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

function isVirtualPoolBatch(value: boolean | number | null | undefined): boolean {
  return value === true || Number(value) === 1;
}

const startInventorySessionSchema = z.object({
  metal: z
    .string()
    .trim()
    .min(1, "Metal is required")
    .max(40, "Metal must be 40 characters or fewer")
});

export async function registerInventoryRoutes(app: FastifyInstance) {
  await ensureInventorySessionSchema();

  app.get("/v1/inventory/sessions/active", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    return one(
      `select s.id, s.user_id, s.metal, s.started_at, s.ended_at,
              u.username, u.display_name
       from inventory_sessions s
       join users u on u.id = s.user_id
       where s.user_id = ? and s.ended_at is null
       order by s.started_at desc
       limit 1`,
      [userId]
    );
  });

  app.post("/v1/inventory/sessions/start", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    const body = startInventorySessionSchema.parse(req.body);

    const existing = await one<{ id: string; metal: string }>(
      "select id, metal from inventory_sessions where user_id = ? and ended_at is null order by started_at desc limit 1",
      [userId]
    );
    if (existing) {
      if (existing.metal !== body.metal) {
        return req.server.httpErrors.conflict("End the active inventory session before starting a different metal");
      }
      return one(
        `select s.id, s.user_id, s.metal, s.started_at, s.ended_at,
                u.username, u.display_name
         from inventory_sessions s
         join users u on u.id = s.user_id
         where s.id = ?`,
        [existing.id]
      );
    }

    const row = await one<{ id: string }>(
      "insert into inventory_sessions (user_id, metal) values (?, ?) returning id",
      [userId, body.metal]
    );
    if (!row) throw new Error("Failed to start inventory session");
    await q(
      "insert into inventory_session_events (session_id, user_id, action, entity_type, entity_id, metadata) values (?, ?, 'start_session', 'inventory_session', ?, ?)",
      [row.id, userId, row.id, JSON.stringify({ metal: body.metal })]
    );
    return one(
      `select s.id, s.user_id, s.metal, s.started_at, s.ended_at,
              u.username, u.display_name
       from inventory_sessions s
       join users u on u.id = s.user_id
       where s.id = ?`,
      [row.id]
    );
  });

  app.post("/v1/inventory/sessions/:id/end", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    const isAdmin = req.authUser?.role === "admin";
    if (!userId) throw new Error("Unauthorized");
    const { id } = req.params as { id: string };
    const session = await one<{ id: string; user_id: string; ended_at: string | null }>(
      "select id, user_id, ended_at from inventory_sessions where id = ?",
      [id]
    );
    if (!session) return req.server.httpErrors.notFound("Inventory session not found");
    if (!isAdmin && session.user_id !== userId) return req.server.httpErrors.forbidden();
    if (!session.ended_at) {
      await q("update inventory_sessions set ended_at = now() where id = ?", [id]);
      await q(
        "insert into inventory_session_events (session_id, user_id, action, entity_type, entity_id, metadata) values (?, ?, 'end_session', 'inventory_session', ?, ?)",
        [id, userId, id, JSON.stringify({})]
      );
    }
    return { ok: true, id };
  });

  app.get("/v1/admin/inventory/sessions", { preHandler: requireRole("admin") }, async () => {
    const sessions = await q<Record<string, unknown>>(
      `select s.id, s.user_id, s.metal, s.started_at, s.ended_at,
              u.username, u.display_name,
              count(b.id)::int as sticker_count,
              coalesce(sum(b.actual_weight_grams), 0) as total_grams
       from inventory_sessions s
       join users u on u.id = s.user_id
       left join bag_orders b on b.inventory_session_id = s.id
       group by s.id, s.user_id, s.metal, s.started_at, s.ended_at, u.username, u.display_name
       order by s.started_at desc
       limit 100`
    );
    const sessionIds = sessions.map((s) => s.id as string);
    const bags = sessionIds.length
      ? await q<Record<string, unknown>>(
          `select id, inventory_session_id, sticker_code, metal, actual_weight_grams, tier_index, sold_at, created_at
           from bag_orders
           where inventory_session_id in (${sessionIds.map(() => "?").join(",")})
           order by created_at desc`,
          sessionIds
        )
      : [];
    const events = sessionIds.length
      ? await q<Record<string, unknown>>(
          `select id, session_id, user_id, action, entity_type, entity_id, metadata, created_at
           from inventory_session_events
           where session_id in (${sessionIds.map(() => "?").join(",")})
           order by created_at desc`,
          sessionIds
        )
      : [];
    return sessions.map((s) => ({
      ...s,
      bag_orders: bags.filter((b) => b.inventory_session_id === s.id),
      events: events.filter((e) => e.session_id === s.id)
    }));
  });

  app.get("/v1/inventory/batches", { preHandler: requireAuth }, async () => {
    return q(
      "select id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_number, batch_name, sticker_batch_letter, created_at from inventory_batches where is_virtual_pool = false order by date desc"
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
         (select string_agg(upper(sticker_batch_letter), ',') from inventory_batches where metal = ?) as used_letters`,
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

    const batch = await one<{ id: string; metal: string; is_virtual_pool: boolean | number }>(
      "select id, metal, is_virtual_pool from inventory_batches where id = ?",
      [id]
    );
    if (!batch) throw new Error("Batch not found");
    if (isVirtualPoolBatch(batch.is_virtual_pool)) {
      throw new Error("Cannot update virtual metal pool batch");
    }

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
    const batch = await one<{ id: string; metal: string; is_virtual_pool: boolean | number }>(
      "select id, metal, is_virtual_pool from inventory_batches where id = ?",
      [id]
    );
    if (!batch) throw new Error("Batch not found");
    if (isVirtualPoolBatch(batch.is_virtual_pool)) {
      throw new Error("Cannot delete virtual metal pool batch");
    }

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

async function ensureInventorySessionSchema() {
  await q(`
    create table if not exists inventory_sessions (
      id text primary key default replace(gen_random_uuid()::text, '-', ''),
      user_id text not null references users(id) on delete restrict,
      metal text not null,
      started_at timestamptz not null default now(),
      ended_at timestamptz
    )
  `);
  await q("alter table inventory_sessions drop constraint if exists inventory_sessions_metal_check");
  await q(`
    create index if not exists idx_inventory_sessions_user_active
      on inventory_sessions (user_id, ended_at, started_at desc)
  `);
  await q(`
    alter table bag_orders
      add column if not exists inventory_session_id text references inventory_sessions(id) on delete set null
  `);
  await q(`
    create index if not exists idx_bag_orders_inventory_session
      on bag_orders (inventory_session_id)
  `);
  await q(`
    create table if not exists inventory_session_events (
      id text primary key default replace(gen_random_uuid()::text, '-', ''),
      session_id text not null references inventory_sessions(id) on delete cascade,
      user_id text not null references users(id) on delete restrict,
      action text not null,
      entity_type text not null,
      entity_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await q(`
    create index if not exists idx_inventory_session_events_session
      on inventory_session_events (session_id, created_at desc)
  `);
  await q("alter table bag_orders drop constraint if exists bag_orders_metal_check");
  await q("alter table stream_items drop constraint if exists stream_items_metal_check");
}
