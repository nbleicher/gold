import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { one, q, txQ, withWriteTx } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

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

const reviewScheduleSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().max(500).optional()
});

const patchCompletedEarningsSchema = z.object({
  completedEarnings: z.number().nonnegative()
});

const purgeUserConfirmSchema = z.object({
  confirm: z
    .string()
    .trim()
    .refine((val) => val === "delete", { message: "Type delete to confirm" })
});

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/v1/admin/users", adminPre, async () => {
    return q<{
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      is_active: number;
      deactivated_at: string | null;
      deactivated_by: string | null;
    }>(
      "select id, email, display_name, role, is_active, deactivated_at, deactivated_by from users where purged_at is null order by email asc"
    );
  });

  app.delete("/v1/admin/users/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const actorId = req.authUser?.sub;
    if (!actorId) throw new Error("Unauthorized");
    if (id === actorId) {
      return req.server.httpErrors.conflict("You cannot deactivate your own account");
    }

    const target = await one<{ id: string; role: "admin" | "user"; is_active: number }>(
      "select id, role, is_active from users where id = ?",
      [id]
    );
    if (!target) {
      return req.server.httpErrors.notFound("User not found");
    }
    if (!target.is_active) {
      return { ok: true, id, idempotent: true };
    }

    if (target.role === "admin") {
      const activeAdminCount = await one<{ count: number }>(
        "select count(*) as count from users where role = 'admin' and is_active = 1"
      );
      const n = Number(activeAdminCount?.count ?? 0);
      if (n <= 1) {
        return req.server.httpErrors.conflict("Cannot deactivate the last active admin");
      }
    }

    await q(
      "update users set is_active = 0, deactivated_at = datetime('now'), deactivated_by = ? where id = ?",
      [actorId, id]
    );
    return { ok: true, id };
  });

  app.patch("/v1/admin/users/:id/reactivate", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const target = await one<{ id: string; is_active: number; purged_at: string | null }>(
      "select id, is_active, purged_at from users where id = ?",
      [id]
    );
    if (!target) {
      return req.server.httpErrors.notFound("User not found");
    }
    if (target.purged_at) {
      return req.server.httpErrors.conflict("This account was removed from the app and cannot be reactivated");
    }
    if (target.is_active) {
      return { ok: true, id, idempotent: true };
    }
    await q(
      "update users set is_active = 1, deactivated_at = null, deactivated_by = null where id = ?",
      [id]
    );
    return { ok: true, id };
  });

  app.post("/v1/admin/users/:id/purge-from-app", adminPre, async (req) => {
    purgeUserConfirmSchema.parse(req.body);
    const { id } = req.params as { id: string };
    const actorId = req.authUser?.sub;
    if (!actorId) throw new Error("Unauthorized");
    if (id === actorId) {
      return req.server.httpErrors.conflict("You cannot remove your own account");
    }
    const target = await one<{ id: string; is_active: number; purged_at: string | null }>(
      "select id, is_active, purged_at from users where id = ?",
      [id]
    );
    if (!target) {
      return req.server.httpErrors.notFound("User not found");
    }
    if (target.purged_at) {
      return { ok: true, id, idempotent: true };
    }
    if (target.is_active) {
      return req.server.httpErrors.conflict("Deactivate the user before removing from the app");
    }
    const newEmail = `purged+${id}@invalid`;
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    await q(
      "update users set email = ?, password_hash = ?, display_name = null, purged_at = datetime('now'), purged_by = ? where id = ?",
      [newEmail, passwordHash, actorId, id]
    );
    return { ok: true, id };
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
    const { from, to, status } = req.query as { from?: string; to?: string; status?: string };
    if (!from || !to) throw new Error("from and to query params required (YYYY-MM-DD)");
    const statusFilter = status && ["pending", "approved", "rejected"].includes(status) ? status : null;
    return q<{
      id: string;
      date: string;
      start_time: string;
      streamer_id: string;
      created_at: string;
      status: "pending" | "approved" | "rejected";
      submitted_by: string | null;
      pending_submitted_at: string | null;
      reviewed_at: string | null;
      reviewed_by: string | null;
      review_note: string | null;
      streamer_email: string;
      streamer_display_name: string | null;
      submitted_by_email: string | null;
      submitted_by_display_name: string | null;
      reviewed_by_email: string | null;
      reviewed_by_display_name: string | null;
    }>(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.status, s.submitted_by, s.pending_submitted_at,
              s.reviewed_at, s.reviewed_by, s.review_note,
              u.email as streamer_email, u.display_name as streamer_display_name,
              su.email as submitted_by_email, su.display_name as submitted_by_display_name,
              ru.email as reviewed_by_email, ru.display_name as reviewed_by_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       left join users su on su.id = s.submitted_by
       left join users ru on ru.id = s.reviewed_by
       where s.date >= ? and s.date <= ?
       ${statusFilter ? "and s.status = ?" : ""}
       order by s.date asc,
                s.start_time asc,
                case when s.status = 'pending' then 0 else 1 end asc,
                coalesce(s.pending_submitted_at, s.created_at) desc`,
      statusFilter ? [from, to, statusFilter] : [from, to]
    );
  });

  app.post("/v1/admin/schedules", adminPre, async (req) => {
    const body = createScheduleSchema.parse(req.body);
    const user = await one<{ id: string }>("select id from users where id = ?", [body.streamerId]);
    if (!user) throw new Error("Streamer not found");
    const ins = await one<{ id: string }>(
      `insert into schedules (date, start_time, streamer_id, status, submitted_by, pending_submitted_at, reviewed_at, reviewed_by)
       values (?, ?, ?, 'approved', ?, datetime('now'), datetime('now'), ?)
       returning id`,
      [body.date, body.startTime, body.streamerId, req.authUser?.sub ?? null, req.authUser?.sub ?? null]
    );
    if (!ins) throw new Error("Schedule insert failed");
    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.status, s.submitted_by, s.pending_submitted_at,
              s.reviewed_at, s.reviewed_by, s.review_note,
              u.email as streamer_email, u.display_name as streamer_display_name
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
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.status, s.submitted_by, s.pending_submitted_at,
              s.reviewed_at, s.reviewed_by, s.review_note,
              u.email as streamer_email, u.display_name as streamer_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       where s.id = ?`,
      [id]
    );
  });

  app.patch("/v1/admin/schedules/:id/review", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const body = reviewScheduleSchema.parse(req.body);
    const existing = await one<{ id: string; status: string }>("select id, status from schedules where id = ?", [id]);
    if (!existing) {
      return req.server.httpErrors.notFound("Schedule slot not found");
    }
    if (existing.status !== "pending") {
      return req.server.httpErrors.conflict("Only pending schedules can be reviewed");
    }
    const nextStatus = body.action === "approve" ? "approved" : "rejected";
    await q(
      "update schedules set status = ?, reviewed_at = datetime('now'), reviewed_by = ?, review_note = ? where id = ?",
      [nextStatus, req.authUser?.sub ?? null, body.reviewNote ?? null, id]
    );
    return { ok: true, id, status: nextStatus };
  });

  app.get("/v1/schedules/mine", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    const { from, to } = req.query as { from?: string; to?: string };
    const where = from && to ? "where s.date >= ? and s.date <= ? and s.submitted_by = ?" : "where s.submitted_by = ?";
    const args = from && to ? [from, to, userId] : [userId];
    return q<{
      id: string;
      date: string;
      start_time: string;
      streamer_id: string;
      created_at: string;
      status: "pending" | "approved" | "rejected";
      submitted_by: string | null;
      pending_submitted_at: string | null;
      reviewed_at: string | null;
      reviewed_by: string | null;
      review_note: string | null;
      streamer_email: string;
      streamer_display_name: string | null;
    }>(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.status, s.submitted_by, s.pending_submitted_at,
              s.reviewed_at, s.reviewed_by, s.review_note, u.email as streamer_email, u.display_name as streamer_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       ${where}
       order by s.date asc, s.start_time asc, coalesce(s.pending_submitted_at, s.created_at) desc`,
      args
    );
  });

  app.post("/v1/schedules/mine", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    const body = z.object({ date: z.string().min(10), startTime: z.string().min(1) }).parse(req.body);
    const ins = await one<{ id: string }>(
      `insert into schedules (date, start_time, streamer_id, status, submitted_by, pending_submitted_at)
       values (?, ?, ?, 'pending', ?, datetime('now'))
       returning id`,
      [body.date, body.startTime, userId, userId]
    );
    if (!ins) throw new Error("Schedule insert failed");
    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.status, s.submitted_by, s.pending_submitted_at,
              s.reviewed_at, s.reviewed_by, s.review_note, u.email as streamer_email, u.display_name as streamer_display_name
       from schedules s
       join users u on u.id = s.streamer_id
       where s.id = ?`,
      [ins.id]
    );
  });

  app.patch("/v1/schedules/mine/:id", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    const { id } = req.params as { id: string };
    const body = z.object({ date: z.string().min(10).optional(), startTime: z.string().min(1).optional() }).parse(req.body);
    const existing = await one<{ id: string; submitted_by: string | null; status: string; date: string; start_time: string }>(
      "select id, submitted_by, status, date, start_time from schedules where id = ?",
      [id]
    );
    if (!existing || existing.submitted_by !== userId) return req.server.httpErrors.notFound("Schedule slot not found");
    if (existing.status !== "pending") return req.server.httpErrors.conflict("Only pending schedules can be edited");
    await q("update schedules set date = ?, start_time = ?, pending_submitted_at = datetime('now') where id = ?", [
      body.date ?? existing.date,
      body.startTime ?? existing.start_time,
      id
    ]);
    return { ok: true, id };
  });

  app.delete("/v1/schedules/mine/:id", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    const { id } = req.params as { id: string };
    const existing = await one<{ id: string; submitted_by: string | null; status: string }>(
      "select id, submitted_by, status from schedules where id = ?",
      [id]
    );
    if (!existing || existing.submitted_by !== userId) return req.server.httpErrors.notFound("Schedule slot not found");
    if (existing.status !== "pending") return req.server.httpErrors.conflict("Only pending schedules can be deleted");
    await q("delete from schedules where id = ?", [id]);
    return { ok: true };
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
      completed_earnings: number | null;
      user_email: string | null;
      user_display_name: string | null;
    }>(
      `select s.id, s.user_id, s.started_at, s.ended_at, s.gold_batch_id, s.silver_batch_id,
              s.completed_earnings,
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
      streams: streams.map((s) => {
        const ce = s.completed_earnings;
        const completed_earnings =
          ce === null || ce === undefined ? null : Number(ce);
        return {
          ...s,
          completed_earnings: Number.isFinite(completed_earnings) ? completed_earnings : null,
          gold_batch_name: s.gold_batch_id ? batchNameById[s.gold_batch_id] ?? "—" : "—",
          silver_batch_name: s.silver_batch_id ? batchNameById[s.silver_batch_id] ?? "—" : "—",
          items: (itemsByStream.get(s.id) ?? []).map((it) => ({
            ...it,
            batch_name: it.batch_id ? batchNameById[it.batch_id] ?? null : null
          }))
        };
      })
    };
  });

  app.patch("/v1/admin/streams/:id/completed-earnings", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchCompletedEarningsSchema.parse(req.body);
    const stream = await one<{ id: string }>("select id from streams where id = ?", [id]);
    if (!stream) {
      return req.server.httpErrors.notFound("Stream not found");
    }
    await q("update streams set completed_earnings = ? where id = ?", [body.completedEarnings, id]);
    return { ok: true };
  });

  app.delete("/v1/admin/streams/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const stream = await one<{ id: string }>("select id from streams where id = ?", [id]);
    if (!stream) throw new Error("Stream not found");

    const items = await q<{
      sale_type: string;
      batch_id: string | null;
      weight_grams: number;
      sticker_code: string | null;
    }>("select sale_type, batch_id, weight_grams, sticker_code from stream_items where stream_id = ?", [id]);

    try {
      await withWriteTx(async (tx) => {
        for (const it of items) {
          if (it.sale_type === "raw" && it.batch_id) {
            await txQ(tx, "update inventory_batches set remaining_grams = remaining_grams + ? where id = ?", [
              it.weight_grams,
              it.batch_id
            ]);
          }
          if (it.sale_type === "sticker" && it.sticker_code) {
            await txQ(tx, "update bag_orders set sold_at = null where upper(sticker_code) = ?", [
              it.sticker_code.toUpperCase()
            ]);
          }
        }
        await txQ(tx, "delete from streams where id = ?", [id]);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      req.log.error({ err: e, streamId: id }, `admin delete stream failed: ${msg}`);
      throw e;
    }
    return { ok: true };
  });
}
