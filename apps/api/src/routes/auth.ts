import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/v1/auth/profile/:userId", async (req) => {
    const { userId } = req.params as { userId: string };
    const { data, error } = await db
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", userId)
      .single();
    if (error || !data) throw error ?? new Error("Profile not found");
    return {
      id: data.id,
      role: data.role,
      displayName: data.display_name
    };
  });
}
