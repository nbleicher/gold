import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { one, q, txQ, withWriteTx } from "../db.js";
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
import { requireAuth, requireRole, type AppRole } from "./auth.js";

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

const adminCreateScheduleBodySchema = z
  .object({
    date: z.string().min(10),
    streamerId: z.string().min(1),
    startTime: z.string().min(1).optional(),
    hoursWorked: z.number().positive().optional()
  })
  .superRefine((data, ctx) => {
    const hasTime = Boolean(data.startTime?.trim());
    const hasHours = data.hoursWorked != null;
    if (hasTime === hasHours) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of: startTime (stream slot) or hoursWorked (labor entry)"
      });
    }
  });

const patchScheduleSchema = z.object({
  date: z.string().min(10).optional(),
  startTime: z.string().min(1).optional(),
  streamerId: z.string().min(1).optional(),
  hoursWorked: z.number().positive().optional()
});

const reviewScheduleSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().max(500).optional()
});

const patchCompletedEarningsSchema = z.object({
  completedEarnings: z.number().nonnegative()
});

const patchUserPaySettingsSchema = z.object({
  commissionPercent: z.number().min(0).max(100).optional(),
  hourlyRate: z.number().nonnegative().optional()
});

const putPayrollLaborDaySchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

function payrollMinutesFromHHMM(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const purgeUserConfirmSchema = z.object({
  confirm: z
    .string()
    .trim()
    .refine((val) => val === "delete", { message: "Type delete to confirm" })
});

type StreamItemWithSpot = StreamItemCogsInput & { spot_value: number };

async function computeCogsByItemIdForDbItems(items: StreamItemWithSpot[]): Promise<Map<string, number>> {
  if (!items.length) return new Map();

  const batchIdSet = new Set<string>();
  for (const it of items) {
    if (it.sale_type === "raw" && it.batch_id) batchIdSet.add(it.batch_id);
  }

  const stickerCodes: string[] = [];
  for (const it of items) {
    if (it.sale_type === "sticker" && it.sticker_code) {
      const c = String(it.sticker_code).trim().toUpperCase();
      if (c) stickerCodes.push(c);
    }
  }
  const uniqueStickers = [...new Set(stickerCodes)];

  let orders: BagOrderRow[] = [];
  if (uniqueStickers.length) {
    const ph = uniqueStickers.map(() => "?").join(",");
    orders = await q<BagOrderRow>(
      `select id, primary_batch_id, actual_weight_grams, sticker_code from bag_orders where upper(sticker_code) in (${ph})`,
      uniqueStickers
    );
    for (const o of orders) batchIdSet.add(o.primary_batch_id);
  }

  let componentsRows: ComponentRow[] = [];
  if (orders.length) {
    const oids = orders.map((o) => o.id);
    const oph = oids.map(() => "?").join(",");
    componentsRows = await q<ComponentRow>(
      `select bag_order_id, batch_id, weight_grams from bag_order_components where bag_order_id in (${oph})`,
      oids
    );
    for (const c of componentsRows) batchIdSet.add(c.batch_id);
  }

  const componentsByOrderId = buildComponentsByOrder(componentsRows);
  const orderBySticker = buildOrderBySticker(orders);

  const batchIds = [...batchIdSet];
  let batchById = new Map<string, BatchRow>();
  if (batchIds.length) {
    const bph = batchIds.map(() => "?").join(",");
    const batches = await q<BatchRow>(
      `select id, total_cost, grams from inventory_batches where id in (${bph})`,
      batchIds
    );
    batchById = buildBatchMap(batches);
  }

  return cogsByItemId(items, batchById, orderBySticker, componentsByOrderId);
}

type CommissionStreamRowPreview = {
  streamId: string;
  startedAt: string;
  completedEarnings: number | null;
  cogs: number;
  net: number;
  missingCompletedEarnings: boolean;
};

async function computeCommissionMetricsForUser(
  userId: string,
  start: string,
  end: string,
  commissionPercentField: number
): Promise<{
  streams: CommissionStreamRowPreview[];
  totalNet: number;
  commissionAmount: number;
  commissionPercent: number;
}> {
  const streams = await q<{
    id: string;
    started_at: string;
    completed_earnings: number | null;
  }>(
    `select id, started_at, completed_earnings from streams
     where user_id = ? and date(started_at) >= date(?) and date(started_at) <= date(?)
     order by started_at desc`,
    [userId, start, end]
  );

  const pct = Number(commissionPercentField);
  const rate = (Number.isFinite(pct) ? pct : 0) / 100;

  if (!streams.length) {
    return {
      streams: [],
      totalNet: 0,
      commissionAmount: 0,
      commissionPercent: Number.isFinite(pct) ? pct : 0
    };
  }

  const streamIds = streams.map((s) => s.id);
  const ph = streamIds.map(() => "?").join(",");
  const items = await q<StreamItemWithSpot>(
    `select id, stream_id, sale_type, batch_id, weight_grams, sticker_code, spot_value from stream_items where stream_id in (${ph})`,
    streamIds
  );
  const cogsMap = await computeCogsByItemIdForDbItems(items);
  const cogsByStream = new Map<string, number>();
  for (const it of items) {
    const c = cogsMap.get(it.id) ?? 0;
    cogsByStream.set(it.stream_id, (cogsByStream.get(it.stream_id) ?? 0) + c);
  }

  let totalNet = 0;
  const rows = streams.map((st) => {
    const cogs = cogsByStream.get(st.id) ?? 0;
    const ce = st.completed_earnings;
    const completed =
      ce === null || ce === undefined || !Number.isFinite(Number(ce)) ? null : Number(ce);
    const missingCompletedEarnings = completed === null;
    const net = missingCompletedEarnings ? 0 : completed - cogs;
    if (!missingCompletedEarnings) totalNet += net;
    return {
      streamId: st.id,
      startedAt: st.started_at,
      completedEarnings: completed,
      cogs,
      net,
      missingCompletedEarnings
    };
  });

  const commissionAmount = totalNet * rate;
  return {
    streams: rows,
    totalNet,
    commissionAmount,
    commissionPercent: Number.isFinite(pct) ? pct : 0
  };
}

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
      commission_percent: number;
      pay_structure: string;
      hourly_rate: number;
      requires_login: number;
    }>(
      `select id, email, display_name, role, is_active, deactivated_at, deactivated_by,
              commission_percent, pay_structure, hourly_rate, requires_login
       from users where purged_at is null order by email asc`
    );
  });

  app.patch("/v1/admin/users/:id/pay-settings", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchUserPaySettingsSchema.parse(req.body);
    const target = await one<{ id: string; role: AppRole }>(
      "select id, role from users where id = ? and purged_at is null",
      [id]
    );
    if (!target) {
      return req.server.httpErrors.notFound("User not found");
    }
    if (target.role === "admin") {
      return req.server.httpErrors.badRequest("Admins do not have payroll pay settings");
    }

    let payStructure: "commission" | "hourly";
    let commissionPct: number;
    let hourly: number;

    if (target.role === "streamer") {
      if (body.commissionPercent === undefined) {
        return req.server.httpErrors.badRequest("commissionPercent is required for streamers");
      }
      payStructure = "commission";
      commissionPct = Math.min(100, Math.max(0, body.commissionPercent));
      hourly = 0;
    } else if (target.role === "shipper" || target.role === "bagger") {
      if (body.hourlyRate === undefined) {
        return req.server.httpErrors.badRequest("hourlyRate is required for shippers and baggers");
      }
      payStructure = "hourly";
      hourly = body.hourlyRate;
      commissionPct = 0;
    } else {
      return req.server.httpErrors.badRequest("Unsupported role for pay settings");
    }

    await q(
      "update users set pay_structure = ?, commission_percent = ?, hourly_rate = ? where id = ?",
      [payStructure, commissionPct, hourly, id]
    );
    return {
      ok: true,
      id,
      payStructure,
      commissionPercent: commissionPct,
      hourlyRate: hourly
    };
  });

  app.delete("/v1/admin/users/:id", adminPre, async (req) => {
    const { id } = req.params as { id: string };
    const actorId = req.authUser?.sub;
    if (!actorId) throw new Error("Unauthorized");
    if (id === actorId) {
      return req.server.httpErrors.conflict("You cannot deactivate your own account");
    }

    const target = await one<{ id: string; role: AppRole; is_active: number }>(
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

  app.get("/v1/admin/profit-metrics", adminPre, async () => {
    const items = await q<StreamItemWithSpot>(
      "select id, stream_id, sale_type, batch_id, weight_grams, sticker_code, spot_value from stream_items"
    );
    const cogsMap = await computeCogsByItemIdForDbItems(items);
    const totalCogs = totalCogsFromMap(cogsMap);
    const totalSpotValueNum = totalSpotValue(items);
    const grossProfit = totalSpotValueNum - totalCogs;
    const expRow = await one<{ s: number | null }>("select sum(cost) as s from expenses");
    const totalExpenses = Number(expRow?.s ?? 0);
    const netProfit = grossProfit - totalExpenses;
    return {
      totalSpotValue: totalSpotValueNum,
      totalCogs,
      totalExpenses,
      grossProfit,
      netProfit,
      lineItemCount: items.length
    };
  });

  app.get("/v1/admin/payroll/commission-preview", adminPre, async (req) => {
    const parsed = z
      .object({
        userId: z.string().min(1),
        start: z.string().min(10),
        end: z.string().min(10)
      })
      .safeParse(req.query);
    if (!parsed.success) {
      return req.server.httpErrors.badRequest("userId, start, and end (YYYY-MM-DD) query params required");
    }
    const { userId, start, end } = parsed.data;

    const user = await one<{ id: string; commission_percent: number; pay_structure: string }>(
      "select id, commission_percent, pay_structure from users where id = ? and purged_at is null",
      [userId]
    );
    if (!user) {
      return req.server.httpErrors.notFound("User not found");
    }
    if (user.pay_structure !== "commission") {
      return req.server.httpErrors.badRequest("Commission preview only applies to users on commission pay");
    }

    const metrics = await computeCommissionMetricsForUser(userId, start, end, Number(user.commission_percent));
    return {
      userId,
      commissionPercent: metrics.commissionPercent,
      streams: metrics.streams,
      totalNet: metrics.totalNet,
      commissionAmount: metrics.commissionAmount
    };
  });

  app.get("/v1/admin/payroll/weekly-summary", adminPre, async (req) => {
    const parsed = z
      .object({
        from: z.string().min(10),
        to: z.string().min(10)
      })
      .safeParse(req.query);
    if (!parsed.success) {
      return req.server.httpErrors.badRequest("from and to query params required (YYYY-MM-DD)");
    }
    const { from, to } = parsed.data;

    const usersList = await q<{
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      pay_structure: string;
      commission_percent: number;
      hourly_rate: number;
    }>(
      `select id, email, display_name, role, pay_structure, commission_percent, hourly_rate
       from users where purged_at is null order by email asc`
    );

    const rows = [];
    for (const u of usersList) {
      const hoursRow = await one<{ s: number | null }>(
        `select sum(hours_worked) as s from schedules
         where streamer_id = ? and entry_type = 'labor' and date >= ? and date <= ?`,
        [u.id, from, to]
      );
      const hoursWorkedWeek = Number(hoursRow?.s ?? 0);
      const hourlyRate = Number(u.hourly_rate ?? 0);
      const hourlyPay = u.pay_structure === "hourly" ? hoursWorkedWeek * hourlyRate : 0;

      let commissionPay = 0;
      if (u.pay_structure === "commission") {
        const m = await computeCommissionMetricsForUser(u.id, from, to, Number(u.commission_percent));
        commissionPay = m.commissionAmount;
      }

      rows.push({
        userId: u.id,
        email: u.email,
        displayName: u.display_name,
        role: u.role,
        payStructure: u.pay_structure,
        commissionPercent: Number(u.commission_percent),
        hourlyRate,
        hoursWorkedWeek,
        hourlyPay,
        commissionPay,
        totalPay: hourlyPay + commissionPay
      });
    }

    return { from, to, users: rows };
  });

  app.put("/v1/admin/payroll/labor-day", adminPre, async (req) => {
    const body = putPayrollLaborDaySchema.parse(req.body);
    const actor = req.authUser?.sub ?? null;
    const assignee = await one<{ id: string; role: AppRole }>(
      "select id, role from users where id = ? and purged_at is null",
      [body.userId]
    );
    if (!assignee) {
      return req.server.httpErrors.notFound("User not found");
    }
    if (assignee.role !== "shipper" && assignee.role !== "bagger") {
      return req.server.httpErrors.badRequest("Labor hours can only be set for shippers and baggers");
    }

    const startRaw = (body.startTime ?? "").trim();
    const endRaw = (body.endTime ?? "").trim();

    if (!startRaw && !endRaw) {
      await withWriteTx(async (tx) => {
        await txQ(tx, "delete from schedules where streamer_id = ? and date = ? and entry_type = 'labor'", [
          body.userId,
          body.date
        ]);
      });
      return {
        ok: true as const,
        userId: body.userId,
        date: body.date,
        startTime: null as string | null,
        endTime: null as string | null,
        hours: 0
      };
    }

    if (!startRaw || !endRaw) {
      return req.server.httpErrors.badRequest("startTime and endTime are both required to set a shift (or omit both to clear)");
    }

    const startM = payrollMinutesFromHHMM(startRaw);
    const endM = payrollMinutesFromHHMM(endRaw);
    if (startM === null || endM === null) {
      return req.server.httpErrors.badRequest("Invalid time format (use HH:MM)");
    }
    if (endM <= startM) {
      return req.server.httpErrors.badRequest("End time must be after start time on the same day");
    }

    const hours = (endM - startM) / 60;
    if (hours <= 0 || !Number.isFinite(hours)) {
      return req.server.httpErrors.badRequest("Computed hours must be positive");
    }

    const startNorm = `${String(Math.floor(startM / 60)).padStart(2, "0")}:${String(startM % 60).padStart(2, "0")}`;
    const endNorm = `${String(Math.floor(endM / 60)).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;

    await withWriteTx(async (tx) => {
      await txQ(tx, "delete from schedules where streamer_id = ? and date = ? and entry_type = 'labor'", [
        body.userId,
        body.date
      ]);
      await txQ(
        tx,
        `insert into schedules (date, start_time, streamer_id, status, submitted_by, pending_submitted_at, reviewed_at, reviewed_by, entry_type, hours_worked)
         values (?, ?, ?, 'approved', ?, datetime('now'), datetime('now'), ?, 'labor', ?)`,
        [body.date, startNorm, body.userId, actor, actor, hours]
      );
    });

    return {
      ok: true as const,
      userId: body.userId,
      date: body.date,
      startTime: startNorm,
      endTime: endNorm,
      hours
    };
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
      entry_type: string;
      hours_worked: number | null;
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
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.entry_type, s.hours_worked, s.status, s.submitted_by, s.pending_submitted_at,
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
    const body = adminCreateScheduleBodySchema.parse(req.body);
    const assignee = await one<{ id: string; role: AppRole }>(
      "select id, role from users where id = ? and purged_at is null",
      [body.streamerId]
    );
    if (!assignee) throw new Error("User not found");

    const actor = req.authUser?.sub ?? null;
    const isLabor = body.hoursWorked != null;

    if (isLabor) {
      if (assignee.role !== "shipper" && assignee.role !== "bagger") {
        throw new Error("Labor hours can only be assigned to shippers or baggers");
      }
      const hoursWorked = body.hoursWorked!;
      const ins = await one<{ id: string }>(
        `insert into schedules (date, start_time, streamer_id, status, submitted_by, pending_submitted_at, reviewed_at, reviewed_by, entry_type, hours_worked)
         values (?, '00:00', ?, 'approved', ?, datetime('now'), datetime('now'), ?, 'labor', ?)
         returning id`,
        [body.date, body.streamerId, actor, actor, hoursWorked]
      );
      if (!ins) throw new Error("Schedule insert failed");
      return one(
        `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.entry_type, s.hours_worked, s.status, s.submitted_by, s.pending_submitted_at,
                s.reviewed_at, s.reviewed_by, s.review_note,
                u.email as streamer_email, u.display_name as streamer_display_name
         from schedules s
         join users u on u.id = s.streamer_id
         where s.id = ?`,
        [ins.id]
      );
    }

    if (assignee.role !== "admin" && assignee.role !== "streamer") {
      throw new Error("Stream slots can only be assigned to admins or streamers");
    }
    const startTime = body.startTime!.trim();
    const ins = await one<{ id: string }>(
      `insert into schedules (date, start_time, streamer_id, status, submitted_by, pending_submitted_at, reviewed_at, reviewed_by, entry_type, hours_worked)
       values (?, ?, ?, 'approved', ?, datetime('now'), datetime('now'), ?, 'stream', null)
       returning id`,
      [body.date, startTime, body.streamerId, actor, actor]
    );
    if (!ins) throw new Error("Schedule insert failed");
    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.entry_type, s.hours_worked, s.status, s.submitted_by, s.pending_submitted_at,
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
    const row = await one<{
      date: string;
      start_time: string;
      streamer_id: string;
      entry_type: string;
      hours_worked: number | null;
    }>("select date, start_time, streamer_id, entry_type, hours_worked from schedules where id = ?", [id]);
    if (!row) throw new Error("Schedule slot not found");

    if (body.streamerId) {
      const u = await one<{ id: string; role: AppRole }>("select id, role from users where id = ? and purged_at is null", [
        body.streamerId
      ]);
      if (!u) throw new Error("User not found");
      if (row.entry_type === "labor") {
        if (u.role !== "shipper" && u.role !== "bagger") {
          throw new Error("Labor entries can only be assigned to shippers or baggers");
        }
      } else if (u.role !== "admin" && u.role !== "streamer") {
        throw new Error("Stream slots can only be assigned to admins or streamers");
      }
    }

    if (row.entry_type === "labor") {
      if (body.startTime !== undefined) {
        throw new Error("Cannot set start time on a labor entry");
      }
      const date = body.date ?? row.date;
      const streamerId = body.streamerId ?? row.streamer_id;
      const hours = body.hoursWorked ?? row.hours_worked;
      if (hours === null || hours === undefined || !Number.isFinite(Number(hours)) || Number(hours) <= 0) {
        throw new Error("hoursWorked must be a positive number for labor entries");
      }
      await q(
        "update schedules set date = ?, start_time = '00:00', streamer_id = ?, hours_worked = ?, entry_type = 'labor' where id = ?",
        [date, streamerId, Number(hours), id]
      );
    } else {
      if (body.hoursWorked !== undefined) {
        throw new Error("Cannot set hours worked on a stream entry");
      }
      const date = body.date ?? row.date;
      const startTime = body.startTime ?? row.start_time;
      const streamerId = body.streamerId ?? row.streamer_id;
      await q("update schedules set date = ?, start_time = ?, streamer_id = ?, hours_worked = null, entry_type = 'stream' where id = ?", [
        date,
        startTime,
        streamerId,
        id
      ]);
    }

    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.entry_type, s.hours_worked, s.status, s.submitted_by, s.pending_submitted_at,
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
    const existing = await one<{ id: string; status: string; entry_type: string }>(
      "select id, status, entry_type from schedules where id = ?",
      [id]
    );
    if (!existing) {
      return req.server.httpErrors.notFound("Schedule slot not found");
    }
    if (existing.entry_type === "labor") {
      return req.server.httpErrors.conflict("Labor entries cannot be reviewed");
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
      entry_type: string;
      hours_worked: number | null;
      status: "pending" | "approved" | "rejected";
      submitted_by: string | null;
      pending_submitted_at: string | null;
      reviewed_at: string | null;
      reviewed_by: string | null;
      review_note: string | null;
      streamer_email: string;
      streamer_display_name: string | null;
    }>(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.entry_type, s.hours_worked, s.status, s.submitted_by, s.pending_submitted_at,
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
      `insert into schedules (date, start_time, streamer_id, status, submitted_by, pending_submitted_at, entry_type, hours_worked)
       values (?, ?, ?, 'pending', ?, datetime('now'), 'stream', null)
       returning id`,
      [body.date, body.startTime, userId, userId]
    );
    if (!ins) throw new Error("Schedule insert failed");
    return one(
      `select s.id, s.date, s.start_time, s.streamer_id, s.created_at, s.entry_type, s.hours_worked, s.status, s.submitted_by, s.pending_submitted_at,
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
    const existing = await one<{
      id: string;
      submitted_by: string | null;
      status: string;
      date: string;
      start_time: string;
      entry_type: string;
    }>("select id, submitted_by, status, date, start_time, entry_type from schedules where id = ?", [id]);
    if (!existing || existing.submitted_by !== userId) return req.server.httpErrors.notFound("Schedule slot not found");
    if (existing.entry_type === "labor") {
      return req.server.httpErrors.conflict("Labor entries cannot be edited here");
    }
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

    const itemsForCogs: StreamItemWithSpot[] = items.map((it) => ({
      id: it.id,
      stream_id: it.stream_id,
      sale_type: it.sale_type,
      batch_id: it.batch_id,
      weight_grams: Number(it.weight_grams),
      sticker_code: it.sticker_code,
      spot_value: Number(it.spot_value)
    }));
    const cogsByItemId = await computeCogsByItemIdForDbItems(itemsForCogs);
    const cogsByStreamId = new Map<string, number>();
    const spotByStreamId = new Map<string, number>();
    for (const it of items) {
      const cid = it.stream_id;
      const cg = cogsByItemId.get(it.id) ?? 0;
      cogsByStreamId.set(cid, (cogsByStreamId.get(cid) ?? 0) + cg);
      spotByStreamId.set(cid, (spotByStreamId.get(cid) ?? 0) + Number(it.spot_value));
    }

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
        const ceNum = Number.isFinite(completed_earnings) ? completed_earnings : null;
        const items_cogs_total = cogsByStreamId.get(s.id) ?? 0;
        const items_spot_total = spotByStreamId.get(s.id) ?? 0;
        const net_profit =
          ceNum !== null && Number.isFinite(items_cogs_total) ? ceNum - items_cogs_total : null;
        return {
          ...s,
          completed_earnings: ceNum,
          items_spot_total,
          items_cogs_total,
          net_profit,
          gold_batch_name: s.gold_batch_id ? batchNameById[s.gold_batch_id] ?? "—" : "—",
          silver_batch_name: s.silver_batch_id ? batchNameById[s.silver_batch_id] ?? "—" : "—",
          items: (itemsByStream.get(s.id) ?? []).map((it) => ({
            ...it,
            cogs: cogsByItemId.get(it.id) ?? 0,
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
