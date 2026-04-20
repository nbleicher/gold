import type { FastifyInstance } from "fastify";
import { one, q } from "../db.js";
import { requireAuth, requireRole } from "./auth.js";

export async function registerOpsRoutes(app: FastifyInstance) {
  app.get("/v1/schedules", { preHandler: requireAuth }, async () => {
    return q("select * from schedules order by date asc, start_time asc");
  });

  app.post("/v1/schedules", { preHandler: requireRole("admin") }, async (req) => {
    const body = req.body as { date: string; startTime: string; streamerId: string };
    await q(
      "insert into schedules (date, start_time, streamer_id, entry_type, hours_worked) values (?, ?, ?, 'stream', null)",
      [body.date, body.startTime, body.streamerId]
    );
    return one("select * from schedules order by rowid desc limit 1");
  });

  app.delete("/v1/schedules/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from schedules where id = ?", [id]);
    return { ok: true };
  });

  app.get("/v1/expenses", { preHandler: requireAuth }, async () => {
    return q("select * from expenses order by date desc");
  });

  app.post("/v1/expenses", { preHandler: requireRole("admin") }, async (req) => {
    const body = req.body as { date: string; name: string; cost: number };
    await q("insert into expenses (date, name, cost) values (?, ?, ?)", [body.date, body.name, body.cost]);
    return one("select * from expenses order by rowid desc limit 1");
  });

  app.delete("/v1/expenses/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from expenses where id = ?", [id]);
    return { ok: true };
  });

  app.get("/v1/payroll", { preHandler: requireRole("admin") }, async () => {
    return q("select * from payroll_records order by imported_at desc");
  });

  app.post("/v1/payroll", { preHandler: requireRole("admin") }, async (req) => {
    const body = req.body as { userId: string; filename: string; rows: number };
    await q("insert into payroll_records (user_id, filename, rows) values (?, ?, ?)", [
      body.userId,
      body.filename,
      body.rows
    ]);
    return one("select * from payroll_records order by rowid desc limit 1");
  });

  app.delete("/v1/payroll/:id", { preHandler: requireRole("admin") }, async (req) => {
    const { id } = req.params as { id: string };
    await q("delete from payroll_records where id = ?", [id]);
    return { ok: true };
  });
}
