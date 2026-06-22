import type { FastifyInstance } from "fastify";
import { one, q } from "../db.js";
import {
  type BagOrderRow,
  type BatchRow,
  type ComponentRow,
  type StreamItemCogsInput,
  buildBatchMap,
  buildComponentsByOrder,
  buildOrderBySticker,
  cogsByItemId,
  totalCogsFromMap,
  totalSpotValue
} from "../domain/streamCogs.js";
import { requireAuth } from "./auth.js";

function countFromRows(rows: unknown[]): number {
  const first = rows[0] as Record<string | number, unknown> | undefined;
  if (!first) return 0;
  const raw = first.c ?? first[0];
  return typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
}

async function nextApprovedScheduleForStreamer(streamerId: string) {
  const row = await one<{
    id: string;
    date: string;
    start_time: string;
    status: string;
  }>(
    `select id, date, start_time, status from schedules
     where streamer_id = ? and status = 'approved'
       and coalesce(entry_type, 'stream') = 'stream'
       and (date || ' ' || start_time)::timestamp >= now()
     order by date asc, start_time asc
     limit 1`,
    [streamerId]
  );
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    status: row.status
  };
}

type StreamItemWithSpot = StreamItemCogsInput & { spot_value: number };

async function computeCogsByItemIdForDbItems(items: StreamItemWithSpot[]): Promise<Map<string, number>> {
  if (!items.length) return new Map();

  const batchIdSet = new Set<string>();
  for (const it of items) {
    if (it.sale_type === "raw" && it.batch_id) batchIdSet.add(it.batch_id);
  }

  const stickerCodes = [
    ...new Set(
      items
        .filter((it) => it.sale_type === "sticker" && it.sticker_code)
        .map((it) => String(it.sticker_code).trim().toUpperCase())
        .filter(Boolean)
    )
  ];

  let orders: BagOrderRow[] = [];
  if (stickerCodes.length) {
    const ph = stickerCodes.map(() => "?").join(",");
    orders = await q<BagOrderRow>(
      `select id, primary_batch_id, actual_weight_grams, sticker_code,
              cost_basis_method, cost_basis_usd, cost_basis_per_gram
       from bag_orders where upper(sticker_code) in (${ph})`,
      stickerCodes
    );
    for (const o of orders) batchIdSet.add(o.primary_batch_id);
  }

  let componentRows: ComponentRow[] = [];
  if (orders.length) {
    const orderIds = orders.map((o) => o.id);
    const ph = orderIds.map(() => "?").join(",");
    componentRows = await q<ComponentRow>(
      `select bag_order_id, batch_id, weight_grams from bag_order_components where bag_order_id in (${ph})`,
      orderIds
    );
    for (const c of componentRows) batchIdSet.add(c.batch_id);
  }

  let batchById = new Map<string, BatchRow>();
  const batchIds = [...batchIdSet];
  if (batchIds.length) {
    const ph = batchIds.map(() => "?").join(",");
    const batches = await q<BatchRow>(
      `select id, total_cost, grams from inventory_batches where id in (${ph})`,
      batchIds
    );
    batchById = buildBatchMap(batches);
  }

  return cogsByItemId(
    items,
    batchById,
    buildOrderBySticker(orders),
    buildComponentsByOrder(componentRows)
  );
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type AdminSummary = Awaited<ReturnType<typeof _adminDashboardSummary>>;
let adminSummaryCache: { result: AdminSummary; ts: number } | null = null;
const ADMIN_SUMMARY_TTL_MS = 60_000;

async function adminDashboardSummary(): Promise<AdminSummary> {
  if (adminSummaryCache && Date.now() - adminSummaryCache.ts < ADMIN_SUMMARY_TTL_MS) {
    return adminSummaryCache.result;
  }
  const result = await _adminDashboardSummary();
  adminSummaryCache = { result, ts: Date.now() };
  return result;
}

async function _adminDashboardSummary() {
  const [
    items,
    expenseRow,
    streamExpenseRow,
    inventoryRow,
    bagRow,
    recentStreams
  ] = await Promise.all([
    q<StreamItemWithSpot>(
      "select id, stream_id, sale_type, batch_id, weight_grams, sticker_code, spot_value, break_id from stream_items"
    ),
    one<{ s: number | null }>("select coalesce(sum(cost), 0) as s from expenses"),
    one<{ s: number | null }>("select coalesce(sum(price), 0) as s from stream_expenses"),
    one<{
      batch_count: number;
      total_grams: number | null;
      remaining_grams: number | null;
      total_cost: number | null;
    }>(
      `select count(*)::int as batch_count,
              coalesce(sum(grams), 0) as total_grams,
              coalesce(sum(remaining_grams), 0) as remaining_grams,
              coalesce(sum(total_cost), 0) as total_cost
       from inventory_batches
       where is_virtual_pool = false`
    ),
    one<{ total_bags: number; sold_bags: number }>(
      `select count(*)::int as total_bags,
              sum(case when sold_at is not null then 1 else 0 end)::int as sold_bags
       from bag_orders`
    ),
    q<{
      id: string;
      started_at: string;
      ended_at: string | null;
      completed_earnings: number | null;
      username: string | null;
      display_name: string | null;
    }>(
      `select s.id, s.started_at, s.ended_at, s.completed_earnings,
              u.username, u.display_name
       from streams s
       left join users u on u.id = s.user_id
       order by s.started_at desc
       limit 6`
    )
  ]);

  const cogsMap = await computeCogsByItemIdForDbItems(items);
  const totalCogs = totalCogsFromMap(cogsMap);
  const totalSpotValueNum = totalSpotValue(items);
  const totalExpenses = Number(expenseRow?.s ?? 0);
  const totalStreamExpenses = Number(streamExpenseRow?.s ?? 0);
  const grossProfit = totalSpotValueNum - totalCogs;
  const netProfit = grossProfit - totalExpenses - totalStreamExpenses;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 13);
  const sinceYmd = ymdUtc(since);

  const streams = await q<{ id: string; day: string; completed_earnings: number | null }>(
    `select id, (coalesce(ended_at, started_at)::date)::text as day, completed_earnings
     from streams
     where (coalesce(ended_at, started_at)::date)::text >= ?
     order by day asc`,
    [sinceYmd]
  );

  const daily = new Map<
    string,
    { date: string; revenue: number; cogs: number; streamExpenses: number; expenses: number; net: number }
  >();
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const date = ymdUtc(d);
    daily.set(date, { date, revenue: 0, cogs: 0, streamExpenses: 0, expenses: 0, net: 0 });
  }

  if (streams.length) {
    const streamIds = streams.map((s) => s.id);
    const ph = streamIds.map(() => "?").join(",");
    const dailyItems = await q<StreamItemWithSpot>(
      `select id, stream_id, sale_type, batch_id, weight_grams, sticker_code, spot_value, break_id
       from stream_items where stream_id in (${ph})`,
      streamIds
    );
    const dailyCogs = await computeCogsByItemIdForDbItems(dailyItems);
    const dayByStream = new Map(streams.map((s) => [s.id, s.day]));
    for (const st of streams) {
      const row = daily.get(st.day);
      if (row) row.revenue += Number(st.completed_earnings ?? 0);
    }
    for (const it of dailyItems) {
      const day = dayByStream.get(it.stream_id);
      const row = day ? daily.get(day) : null;
      if (row) row.cogs += dailyCogs.get(it.id) ?? 0;
    }
    const streamExpenses = await q<{ stream_id: string; s: number | null }>(
      `select stream_id, coalesce(sum(price), 0) as s
       from stream_expenses where stream_id in (${ph}) group by stream_id`,
      streamIds
    );
    for (const se of streamExpenses) {
      const day = dayByStream.get(se.stream_id);
      const row = day ? daily.get(day) : null;
      if (row) row.streamExpenses += Number(se.s ?? 0);
    }
  }

  const expenseRows = await q<{ date: string; s: number | null }>(
    `select date, coalesce(sum(cost), 0) as s
     from expenses
     where date >= ?
     group by date`,
    [sinceYmd]
  );
  for (const ex of expenseRows) {
    const row = daily.get(ex.date);
    if (row) row.expenses += Number(ex.s ?? 0);
  }
  for (const row of daily.values()) {
    row.net = row.revenue - row.cogs - row.streamExpenses - row.expenses;
  }

  const totalGrams = Number(inventoryRow?.total_grams ?? 0);
  const remainingGrams = Number(inventoryRow?.remaining_grams ?? 0);
  return {
    profitMetrics: {
      totalSpotValue: totalSpotValueNum,
      totalCogs,
      totalExpenses,
      totalStreamExpenses,
      grossProfit,
      netProfit,
      lineItemCount: items.length
    },
    inventory: {
      batchCount: Number(inventoryRow?.batch_count ?? 0),
      totalGrams,
      remainingGrams,
      remainingPercent: totalGrams > 0 ? (remainingGrams / totalGrams) * 100 : 0,
      totalCost: Number(inventoryRow?.total_cost ?? 0)
    },
    bags: {
      total: Number(bagRow?.total_bags ?? 0),
      sold: Number(bagRow?.sold_bags ?? 0)
    },
    dailyProfitLoss: [...daily.values()],
    recentStreams: recentStreams.map((s) => ({
      id: s.id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      completedEarnings: s.completed_earnings == null ? null : Number(s.completed_earnings),
      host: s.display_name?.trim() || s.username || "Unknown"
    }))
  };
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard/home", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser!.sub;

    const todayRows = await q("select count(*) as c from streams where user_id = ? and started_at::date = current_date", [
      userId
    ]);
    const streamsToday = countFromRows(todayRows);

    const nextSchedule = await nextApprovedScheduleForStreamer(userId);

    const last = await one<{
      id: string;
      started_at: string;
      ended_at: string | null;
    }>(
      "select id, started_at, ended_at from streams where user_id = ? order by started_at desc limit 1",
      [userId]
    );

    if (!last) {
      const payload: Record<string, unknown> = { streamsToday, lastStream: null, nextSchedule };
      if (req.authUser?.role === "admin") {
        payload.admin = await adminDashboardSummary();
      }
      return payload;
    }

    const itemRows = await q<{
      spot_value: number;
      weight_grams: number;
      batch_id: string | null;
      break_id: string | null;
      total_cost: number | null;
      grams: number | null;
    }>(
      `select i.spot_value, i.weight_grams, i.batch_id, i.break_id, b.total_cost, b.grams
       from stream_items i
       left join inventory_batches b on b.id = i.batch_id
       where i.stream_id = ?`,
      [last.id]
    );

    let totalSpotValue = 0;
    let estimatedProfit = 0;
    for (const r of itemRows) {
      const sv = Number(r.spot_value);
      const w = Number(r.weight_grams);
      totalSpotValue += sv;
      if (r.break_id) {
        estimatedProfit += 0;
        continue;
      }
      const g = r.grams != null ? Number(r.grams) : 0;
      const tc = r.total_cost != null ? Number(r.total_cost) : 0;
      const costPerGram = g > 0 ? tc / g : 0;
      estimatedProfit += sv - costPerGram * w;
    }

    const start = new Date(last.started_at).getTime();
    const end = last.ended_at ? new Date(last.ended_at).getTime() : Date.now();
    const durationMs = Math.max(end - start, 1000);
    const durationMinutes = durationMs / 60000;
    const profitPerMinute = estimatedProfit / durationMinutes;

    const payload: Record<string, unknown> = {
      streamsToday,
      lastStream: {
        id: last.id,
        startedAt: last.started_at,
        endedAt: last.ended_at,
        itemCount: itemRows.length,
        totalSpotValue,
        estimatedProfit,
        durationMinutes,
        profitPerMinute
      },
      nextSchedule
    };

    if (req.authUser?.role === "admin") {
      payload.admin = await adminDashboardSummary();
    }

    return payload;
  });
}
