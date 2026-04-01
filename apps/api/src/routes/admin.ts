import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { one, q } from "../db.js";
import { requireRole } from "./auth.js";

const adminPre = { preHandler: requireRole("admin") };

const createExpenseSchema = z.object({
  date: z.string().min(10),
  name: z.string().min(1),
  cost: z.number().nonnegative()
});

const createPayrollSchema = z.object({
  userId: z.string().min(1),
  filename: z.string().min(1),
  rows: z.number().int().nonnegative()
});

const createScheduleSchema = z.object({
  date: z.string().min(10),
  startTime: z.string().min(1),
  streamerId: z.string().min(1)
});

const patchScheduleSchema = z.object({
  date: z.string().min(10).optional(),
  startTime: z.string().min(1).optional(),
  streamerId: z.string().min(1).optional()
});

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/v1/admin/users", adminPre, async () => {
    return q<{ id: string; email: string; display_name: string | null; role: string }>(
      "select id, email, display_name, role from users order by email asc"
    );
  });

  app.get("/v1/admin/expenses", adminPre, async () => {
    return q(
      "select id, date, name, cost, created_at from expenses order by date desc, created_at desc"
    );
  });

  app.post("/v1/admin/expenses", adminPre, async (req) => {
    const body = createExpenseSchema.parse(req.body);
    return one<{
      id: string;
      date: string;
      name: string;
      cost: number;
      created_at: string;
    }>("insert into expenses (date, name, cost) values (?, ?, ?) returning id, date, name, cost, created_at", [
      body.date,
      body.name,
      body.cost
    ]);
  });

  app.delete("/v1/admin/expenses/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from expenses where id = ?", [id]);
    return { ok: true };
  });

  app.get("/v1/admin/payroll", adminPre, async () => {
    return q<{
      id: string;
      user_id: string;
      filename: string;
      rows: number;
      imported_at: string;
      email: string;
      display_name: string | null;
    }>(
      `select p.id, p.user_id, p.filename, p.rows, p.imported_at, u.email, u.display_name
       from payroll_records p
       join users u on u.id = p.user_id
       order by p.imported_at desc`
    );
  });

  app.post("/v1/admin/payroll", adminPre, async (req) => {
    const body = createPayrollSchema.parse(req.body);
    const user = await one<{ id: string }>("select id from users where id = ?", [body.userId]);
    if (!user) throw new Error("User not found");
    const ins = await one<{ id: string }>(
      "insert into payroll_records (user_id, filename, rows) values (?, ?, ?) returning id",
      [body.userId, body.filename, body.rows]
    );
    if (!ins) throw new Error("Payroll insert failed");
    return one(
      `select p.id, p.user_id, p.filename, p.rows, p.imported_at, u.email, u.display_name
       from payroll_records p
       join users u on u.id = p.user_id
       where p.id = ?`,
      [ins.id]
    );
  });

  app.delete("/v1/admin/payroll/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from payroll_records where id = ?", [id]);
    return { ok: true };
  });

  app.get("/v1/admin/schedules", adminPre, async (req) => {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) throw new Error("from and to query params required (YYYY-MM-DD)");
    return q<{
      id: string;
      date: string;
      start_time: string;
      streamer_id: string;
      created_at: string;
      streamer_email: string;
      streamer_display_name: string | null;
    }>(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, u.email as streamer_email, u.display_name as streamer_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       where s.date >= ? and s.date <= ?
       order by s.date asc, s.start_time asc`,
      [from, to]
    );
  });

  app.post("/v1/admin/schedules", adminPre, async (req) => {
    const body = createScheduleSchema.parse(req.body);
    const user = await one<{ id: string }>("select id from users where id = ?", [body.streamerId]);
    if (!user) throw new Error("Streamer not found");
    const ins = await one<{ id: string }>(
      "insert into schedules (date, start_time, streamer_id) values (?, ?, ?) returning id",
      [body.date, body.startTime, body.streamerId]
    );
    if (!ins) throw new Error("Schedule insert failed");
    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, u.email as streamer_email, u.display_name as streamer_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       where s.id = ?`,
      [ins.id]
    );
  });

  app.patch("/v1/admin/schedules/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchScheduleSchema.parse(req.body);
    const existing = await one<{ id: string }>("select id from schedules where id = ?", [id]);
    if (!existing) throw new Error("Schedule slot not found");
    if (body.streamerId) {
      const u = await one<{ id: string }>("select id from users where id = ?", [body.streamerId]);
      if (!u) throw new Error("Streamer not found");
    }
    const row = await one<{
      date: string;
      start_time: string;
      streamer_id: string;
    }>("select date, start_time, streamer_id from schedules where id = ?", [id]);
    if (!row) throw new Error("Schedule slot not found");
    const date = body.date ?? row.date;
    const startTime = body.startTime ?? row.start_time;
    const streamerId = body.streamerId ?? row.streamer_id;
    await q("update schedules set date = ?, start_time = ?, streamer_id = ? where id = ?", [
      date,
      startTime,
      streamerId,
      id
    ]);
    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, u.email as streamer_email, u.display_name as streamer_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       where s.id = ?`,
      [id]
    );
  });

  app.delete("/v1/admin/schedules/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from schedules where id = ?", [id]);
    return { ok: true };
  });

  app.get("/v1/admin/stream-log", adminPre, async () => {
    const streams = await q<{
      id: string;
      user_id: string;
      started_at: string;
      ended_at: string | null;
      gold_batch_id: string | null;
      silver_batch_id: string | null;
      user_email: string | null;
      user_display_name: string | null;
    }>(
      `select s.id, s.user_id, s.started_at, s.ended_at, s.gold_batch_id, s.silver_batch_id,
              u.email as user_email, u.display_name as user_display_name
       from streams s
       left join users u on u.id = s.user_id
       order by s.started_at desc`
    );

    if (!streams.length) {
      return { streams: [] as Array<Record<string, unknown>> };
    }

    const streamIds = streams.map((s) => s.id);
    const ph = streamIds.map(() => "?").join(",");
    const items = await q<{
      id: string;
      stream_id: string;
      sale_type: string;
      name: string;
      metal: string;
      weight_grams: number;
      spot_value: number;
      spot_price: number;
      sticker_code: string | null;
      batch_id: string | null;
    }>(`select * from stream_items where stream_id in (${ph})`, streamIds);

    const batchIds = new Set<string>();
    for (const s of streams) {
      if (s.gold_batch_id) batchIds.add(s.gold_batch_id);
      if (s.silver_batch_id) batchIds.add(s.silver_batch_id);
    }
    for (const it of items) {
      if (it.batch_id) batchIds.add(it.batch_id);
    }

    let batchNameById: Record<string, string> = {};
    if (batchIds.size) {
      const ids = [...batchIds];
      const bph = ids.map(() => "?").join(",");
      const batches = await q<{ id: string; batch_name: string }>(
        `select id, batch_name from inventory_batches where id in (${bph})`,
        ids
      );
      batchNameById = Object.fromEntries(batches.map((b) => [b.id, b.batch_name ?? "—"]));
    }

    const itemsByStream = new Map<string, typeof items>();
    for (const it of items) {
      const list = itemsByStream.get(it.stream_id) ?? [];
      list.push(it);
      itemsByStream.set(it.stream_id, list);
    }

    return {
      streams: streams.map((s) => ({
        ...s,
        gold_batch_name: s.gold_batch_id ? batchNameById[s.gold_batch_id] ?? "—" : "—",
        silver_batch_name: s.silver_batch_id ? batchNameById[s.silver_batch_id] ?? "—" : "—",
        items: itemsByStream.get(s.id) ?? []
      }))
    };
  });
}
