import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { one, q } from "../db.js";

async function assertUserSessionAllowed(userId: string) {
  const row = await one<{ is_active: number; purged_at: string | null }>(
    "select is_active, purged_at from users where id = ?",
    [userId]
  );
  if (!row || !row.is_active || row.purged_at) {
    throw new Error("Unauthorized");
  }
}

type JwtPayload = { sub: string; role: "admin" | "user"; email: string };

declare module "fastify" {
  interface FastifyRequest {
    authUser?: JwtPayload;
  }
}

export async function requireAuth(request: import("fastify").FastifyRequest) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    throw new Error("Unauthorized");
  }
  await assertUserSessionAllowed(decoded.sub);
  request.authUser = decoded;
}

export function requireRole(role: "admin" | "user") {
  return async (request: import("fastify").FastifyRequest) => {
    await requireAuth(request);
    if (!request.authUser || (role === "admin" && request.authUser.role !== "admin")) {
      throw new Error("Forbidden");
    }
  };
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/register", async (req) => {
    const body = req.body as { email: string; password: string; displayName?: string; role?: "admin" | "user" };
    const countRow = await one<{ count: number }>("select count(*) as count from users");
    const hasUsers = Number(countRow?.count ?? 0) > 0;
    if (hasUsers) {
      await requireRole("admin")(req);
    }
    const email = body.email.trim().toLowerCase();
    const exists = await one<{ id: string }>("select id from users where email = ?", [email]);
    if (exists) throw new Error("Email already exists");
    const passwordHash = await bcrypt.hash(body.password, 12);
    const role = body.role === "admin" ? "admin" : "user";
    await q(
      "insert into users (email, password_hash, role, display_name) values (?, ?, ?, ?)",
      [email, passwordHash, role, body.displayName ?? null]
    );
    const row = await one<{ id: string; role: "admin" | "user"; display_name: string | null }>(
      "select id, role, display_name from users where email = ?",
      [email]
    );
    return { id: row?.id, role: row?.role, displayName: row?.display_name ?? null };
  });

  app.post("/v1/auth/login", async (req) => {
    const body = req.body as { email: string; password: string };
    const email = body.email.trim().toLowerCase();
    const user = await one<{
      id: string;
      email: string;
      password_hash: string;
      role: "admin" | "user";
      display_name: string | null;
      is_active: number;
      purged_at: string | null;
    }>(
      "select id, email, password_hash, role, display_name, is_active, purged_at from users where email = ?",
      [email]
    );
    if (!user) throw new Error("Invalid credentials");
    if (user.purged_at) throw new Error("Invalid credentials");
    if (!user.is_active) throw new Error("Account deactivated");
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) throw new Error("Invalid credentials");
    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email } satisfies JwtPayload,
      env.jwtSecret,
      { expiresIn: "12h" }
    );
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name
      }
    };
  });

  app.get("/v1/auth/me", { preHandler: requireAuth }, async (req) => {
    const userId = req.authUser?.sub;
    if (!userId) throw new Error("Unauthorized");
    const data = await one<{
      id: string;
      email: string;
      role: "admin" | "user";
      display_name: string | null;
      is_active: number;
      purged_at: string | null;
    }>(
      "select id, email, role, display_name, is_active, purged_at from users where id = ?",
      [userId]
    );
    if (!data) throw new Error("Profile not found");
    if (!data.is_active || data.purged_at) throw new Error("Unauthorized");
    return {
      id: data.id,
      email: data.email,
      role: data.role,
      displayName: data.display_name
    };
  });
}
