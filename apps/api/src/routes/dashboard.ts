import type { FastifyInstance } from "fastify";
import { one, q } from "../db.js";
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
       and ifnull(entry_type, 'stream') = 'stream'
       and datetime(date || ' ' || start_time) >= datetime('now', 'localtime')
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

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard/home", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser!.sub;

    const todayRows = await q(
      "select count(*) as c from streams where user_id = ? and date(started_at) = date('now')",
      [userId]
    );
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
      return { streamsToday, lastStream: null, nextSchedule };
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

    return {
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
  });
}
