import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function registerOpsRoutes(app: FastifyInstance) {
  app.get("/v1/schedules", async () => {
    const { data, error } = await db.from("schedules").select("*").order("date");
    if (error) throw error;
    return data;
  });

  app.post("/v1/schedules", async (req) => {
    const body = req.body as { date: string; startTime: string; streamerId: string };
    const { data, error } = await db
      .from("schedules")
      .insert({
        date: body.date,
        start_time: body.startTime,
        streamer_id: body.streamerId
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

  app.delete("/v1/schedules/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { error } = await db.from("schedules").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

  app.get("/v1/expenses", async () => {
    const { data, error } = await db.from("expenses").select("*").order("date", { ascending: false });
    if (error) throw error;
    return data;
  });

  app.post("/v1/expenses", async (req) => {
    const body = req.body as { date: string; name: string; cost: number };
    const { data, error } = await db.from("expenses").insert(body).select("*").single();
    if (error) throw error;
    return data;
  });

  app.delete("/v1/expenses/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { error } = await db.from("expenses").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

  app.get("/v1/payroll", async () => {
    const { data, error } = await db
      .from("payroll_records")
      .select("*")
      .order("imported_at", { ascending: false });
    if (error) throw error;
    return data;
  });

  app.post("/v1/payroll", async (req) => {
    const body = req.body as { userId: string; filename: string; rows: number };
    const { data, error } = await db
      .from("payroll_records")
      .insert({
        user_id: body.userId,
        filename: body.filename,
        rows: body.rows
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  });

  app.delete("/v1/payroll/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { error } = await db.from("payroll_records").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
