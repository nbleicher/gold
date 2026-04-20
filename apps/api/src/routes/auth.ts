import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../env.js";
import { one, q } from "../db.js";

export const APP_ROLES = ["admin", "streamer", "shipper", "bagger"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type JwtPayload = { sub: string; role: AppRole; email: string };

declare module "fastify" {
  interface FastifyRequest {
    authUser?: JwtPayload;
  }
}

async function loadAuthUserFromDb(userId: string): Promise<JwtPayload> {
  const row = await one<{
    email: string;
    role: AppRole;
    requires_login: number;
    is_active: number;
    purged_at: string | null;
  }>(
    "select email, role, requires_login, is_active, purged_at from users where id = ?",
    [userId]
  );
  if (!row || !row.is_active || row.purged_at) {
    throw new Error("Unauthorized");
  }
  if (row.requires_login !== 1) {
    throw new Error("Unauthorized");
  }
  if (row.role !== "admin" && row.role !== "streamer") {
    throw new Error("Unauthorized");
  }
  return { sub: userId, role: row.role, email: row.email };
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
  request.authUser = await loadAuthUserFromDb(decoded.sub);
}

/** Only `"admin"` is enforced; `"user"` kept for call-site compatibility. */
export function requireRole(role: "admin" | "user") {
  return async (request: import("fastify").FastifyRequest) => {
    await requireAuth(request);
    if (!request.authUser || (role === "admin" && request.authUser.role !== "admin")) {
      throw new Error("Forbidden");
    }
  };
}

const firstBootstrapRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().optional()
});

const adminRegisterUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  displayName: z.string().trim().optional(),
  role: z.enum(APP_ROLES),
  commissionPercent: z.number().min(0).max(100).optional(),
  hourlyRate: z.number().nonnegative().optional()
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/register", async (req) => {
    const countRow = await one<{ count: number }>("select count(*) as count from users");
    const hasUsers = Number(countRow?.count ?? 0) > 0;

    if (!hasUsers) {
      const body = firstBootstrapRegisterSchema.parse(req.body);
      const email = body.email;
      const exists = await one<{ id: string }>("select id from users where email = ?", [email]);
      if (exists) throw new Error("Email already exists");
      const passwordHash = await bcrypt.hash(body.password, 12);
      await q(
        `insert into users (
          email, password_hash, role, display_name,
          commission_percent, requires_login, pay_structure, hourly_rate
        ) values (?, ?, 'admin', ?, 0, 1, 'commission', 0)`,
        [email, passwordHash, body.displayName?.trim() || null]
      );
      const row = await one<{ id: string; role: AppRole; display_name: string | null }>(
        "select id, role, display_name from users where email = ?",
        [email]
      );
      return { id: row?.id, role: row?.role, displayName: row?.display_name ?? null };
    }

    await requireRole("admin")(req);

    const raw = adminRegisterUserSchema.parse(req.body);
    const requiresLogin = raw.role === "admin" || raw.role === "streamer";

    let payStructure: "commission" | "hourly";
    let commissionPct = 0;
    let hourly = 0;
    if (raw.role === "admin") {
      payStructure = "commission";
      commissionPct = 0;
      hourly = 0;
    } else if (raw.role === "streamer") {
      payStructure = "commission";
      commissionPct = Math.min(100, Math.max(0, raw.commissionPercent ?? 0));
    } else {
      payStructure = "hourly";
      hourly = Math.max(0, raw.hourlyRate ?? 0);
    }

    if (requiresLogin) {
      if (!raw.email) {
        throw new Error("Email is required when login is enabled");
      }
      if (!raw.password) {
        throw new Error("Password is required when login is enabled");
      }
      const email = raw.email;
      const exists = await one<{ id: string }>("select id from users where email = ?", [email]);
      if (exists) throw new Error("Email already exists");
      const passwordHash = await bcrypt.hash(raw.password, 12);
      await q(
        `insert into users (
          email, password_hash, role, display_name,
          commission_percent, requires_login, pay_structure, hourly_rate
        ) values (?, ?, ?, ?, ?, 1, ?, ?)`,
        [email, passwordHash, raw.role, raw.displayName?.trim() || null, commissionPct, payStructure, hourly]
      );
      const row = await one<{ id: string; role: AppRole; display_name: string | null }>(
        "select id, role, display_name from users where email = ?",
        [email]
      );
      return { id: row?.id, role: row?.role, displayName: row?.display_name ?? null };
    }

    const dn = raw.displayName?.trim();
    if (!dn) {
      throw new Error("Display name is required for users without login");
    }

    const placeholderEmail = `no-login+${randomBytes(16).toString("hex")}@internal.invalid`;
    const randomSecret = randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomSecret, 12);

    await q(
      `insert into users (
        email, password_hash, role, display_name,
        commission_percent, requires_login, pay_structure, hourly_rate
      ) values (?, ?, ?, ?, ?, 0, ?, ?)`,
      [placeholderEmail, passwordHash, raw.role, dn, commissionPct, payStructure, hourly]
    );
    const row = await one<{ id: string; role: AppRole; display_name: string | null }>(
      "select id, role, display_name from users where email = ?",
      [placeholderEmail]
    );
    return { id: row?.id, role: row?.role, displayName: row?.display_name ?? null };
  });

  app.post("/v1/auth/login", async (req) => {
    const body = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(1)
      })
      .parse(req.body);

    const user = await one<{
      id: string;
      email: string;
      password_hash: string;
      role: AppRole;
      display_name: string | null;
      is_active: number;
      purged_at: string | null;
      requires_login: number;
    }>(
      `select id, email, password_hash, role, display_name, is_active, purged_at, requires_login
       from users where email = ?`,
      [body.email]
    );
    if (!user) throw new Error("Invalid credentials");
    if (user.purged_at) throw new Error("Invalid credentials");
    if (!user.is_active) throw new Error("Account deactivated");
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) throw new Error("Invalid credentials");
    if (user.requires_login !== 1) {
      throw new Error("No app access");
    }
    if (user.role === "shipper" || user.role === "bagger") {
      throw new Error("No app access");
    }
    if (user.role !== "admin" && user.role !== "streamer") {
      throw new Error("No app access");
    }

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
      role: AppRole;
      display_name: string | null;
      is_active: number;
      purged_at: string | null;
    }>("select id, email, role, display_name, is_active, purged_at from users where id = ?", [userId]);
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
