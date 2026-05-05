import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { performance } from "node:perf_hooks";
import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "../env.js";
import { one } from "../db.js";

export const APP_ROLES = ["admin", "streamer", "shipper", "bagger"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type JwtPayload = { sub: string; role: AppRole; username: string };
type AuthIdentity = JwtPayload & { source: "legacy" | "supabase" };

/** Synthetic email to satisfy `users.email NOT NULL UNIQUE` for username-based accounts. */
export function loginEmailFromUsername(username: string): string {
  return `${username.toLowerCase()}@login.internal`;
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-z0-9_]+$/, "Username may only contain letters, numbers, and underscores");

declare module "fastify" {
  interface FastifyRequest {
    authUser?: JwtPayload;
  }
}

async function loadAuthUserFromDb(identity: AuthIdentity): Promise<JwtPayload> {
  const isSupabase = identity.source === "supabase";
  const row = await one<{
    id: string;
    username: string;
    role: AppRole;
    requires_login: number;
    is_active: number;
    purged_at: string | null;
  }>(
    `select id, username, role, requires_login, is_active, purged_at
     from users
     where ${isSupabase ? "supabase_user_id" : "id"} = ?`,
    [identity.sub]
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
  return { sub: row.id, role: row.role, username: row.username };
}

const supabaseJwks = env.supabaseUrl
  ? createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`))
  : null;

async function verifySupabaseToken(token: string): Promise<AuthIdentity> {
  if (!supabaseJwks) throw new Error("Unauthorized");
  const verified = await jwtVerify(token, supabaseJwks, {
    issuer: `${env.supabaseUrl}/auth/v1`
  });
  const appMetadata = (verified.payload.app_metadata ?? {}) as { role?: unknown };
  const userMetadata = (verified.payload.user_metadata ?? {}) as { username?: unknown };
  const role = appMetadata.role;
  if (role !== "admin" && role !== "streamer") {
    throw new Error("Unauthorized");
  }
  const username = String(userMetadata.username ?? verified.payload.email ?? "");
  if (!verified.payload.sub || !username) throw new Error("Unauthorized");
  return {
    sub: verified.payload.sub,
    role,
    username,
    source: "supabase"
  };
}

function verifyLegacyToken(token: string): AuthIdentity {
  const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
  return { ...decoded, source: "legacy" };
}

export async function requireAuth(request: import("fastify").FastifyRequest) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  let identity: AuthIdentity;
  try {
    identity = verifyLegacyToken(token);
  } catch {
    try {
      identity = await verifySupabaseToken(token);
    } catch {
      throw new Error("Unauthorized");
    }
  }
  request.authUser = await loadAuthUserFromDb(identity);
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
  username: usernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().optional()
});

const adminRegisterUserSchema = z.object({
  username: usernameSchema.optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  displayName: z.string().trim().optional(),
  role: z.enum(APP_ROLES),
  commissionPercent: z.number().min(0).max(100).optional(),
  hourlyRate: z.number().nonnegative().optional()
});

function msSince(t0: number): number {
  return Math.round((performance.now() - t0) * 100) / 100;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/register", async (req) => {
    const reqStart = performance.now();
    const countRow = await one<{ count: number }>("select count(*) as count from users");
    const hasUsers = Number(countRow?.count ?? 0) > 0;

    if (!hasUsers) {
      const body = firstBootstrapRegisterSchema.parse(req.body);
      const username = body.username;
      const exists = await one<{ id: string }>("select id from users where username = ?", [username]);
      if (exists) throw new Error("Username already exists");
      const tHash = performance.now();
      const passwordHash = await bcrypt.hash(body.password, 12);
      const bcryptMs = msSince(tHash);
      const email = loginEmailFromUsername(username);
      const tDb = performance.now();
      const row = await one<{ id: string; role: AppRole; display_name: string | null }>(
        `insert into users (
          username, email, password_hash, role, display_name,
          commission_percent, requires_login, pay_structure, hourly_rate
        ) values (?, ?, ?, 'admin', ?, 0, 1, 'commission', 0)
        returning id, role, display_name`,
        [username, email, passwordHash, body.displayName?.trim() || null]
      );
      const dbMs = msSince(tDb);
      req.log.info(
        { route: "POST /v1/auth/register", bootstrap: true, bcryptMs, dbMs, totalMs: msSince(reqStart) },
        "register timing"
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
      if (!raw.username) {
        throw new Error("Username is required when login is enabled");
      }
      if (!raw.password) {
        throw new Error("Password is required when login is enabled");
      }
      const username = raw.username;
      const exists = await one<{ id: string }>("select id from users where username = ?", [username]);
      if (exists) throw new Error("Username already exists");
      const tHash = performance.now();
      const passwordHash = await bcrypt.hash(raw.password, 12);
      const bcryptMs = msSince(tHash);
      const email = loginEmailFromUsername(username);
      const tDb = performance.now();
      const row = await one<{ id: string; role: AppRole; display_name: string | null }>(
        `insert into users (
          username, email, password_hash, role, display_name,
          commission_percent, requires_login, pay_structure, hourly_rate
        ) values (?, ?, ?, ?, ?, ?, 1, ?, ?)
        returning id, role, display_name`,
        [
          username,
          email,
          passwordHash,
          raw.role,
          raw.displayName?.trim() || null,
          commissionPct,
          payStructure,
          hourly
        ]
      );
      const dbMs = msSince(tDb);
      req.log.info(
        { route: "POST /v1/auth/register", bcryptMs, dbMs, totalMs: msSince(reqStart) },
        "register timing"
      );
      return { id: row?.id, role: row?.role, displayName: row?.display_name ?? null };
    }

    const dn = raw.displayName?.trim();
    if (!dn) {
      throw new Error("Display name is required for users without login");
    }

    const placeholderUsername = `nologin_${randomBytes(8).toString("hex")}`;
    const placeholderEmail = `${placeholderUsername}@internal.invalid`;
    const randomSecret = randomBytes(32).toString("hex");
    const tHash = performance.now();
    const passwordHash = await bcrypt.hash(randomSecret, 12);
    const bcryptMs = msSince(tHash);

    const tDb = performance.now();
    const row = await one<{ id: string; role: AppRole; display_name: string | null }>(
      `insert into users (
        username, email, password_hash, role, display_name,
        commission_percent, requires_login, pay_structure, hourly_rate
      ) values (?, ?, ?, ?, ?, ?, 0, ?, ?)
      returning id, role, display_name`,
      [placeholderUsername, placeholderEmail, passwordHash, raw.role, dn, commissionPct, payStructure, hourly]
    );
    const dbMs = msSince(tDb);
    req.log.info(
      { route: "POST /v1/auth/register", bcryptMs, dbMs, totalMs: msSince(reqStart), payrollOnly: true },
      "register timing"
    );
    return { id: row?.id, role: row?.role, displayName: row?.display_name ?? null };
  });

  app.post("/v1/auth/login", async (req) => {
    const body = z
      .object({
        username: usernameSchema,
        password: z.string().min(1)
      })
      .parse(req.body);

    const user = await one<{
      id: string;
      username: string;
      password_hash: string;
      role: AppRole;
      display_name: string | null;
      is_active: number;
      purged_at: string | null;
      requires_login: number;
    }>(
      `select id, username, password_hash, role, display_name, is_active, purged_at, requires_login
       from users where username = ?`,
      [body.username]
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
      { sub: user.id, role: user.role, username: user.username } satisfies JwtPayload,
      env.jwtSecret,
      { expiresIn: "12h" }
    );
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
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
      username: string;
      role: AppRole;
      display_name: string | null;
      is_active: number;
      purged_at: string | null;
    }>("select id, username, role, display_name, is_active, purged_at from users where id = ?", [userId]);
    if (!data) throw new Error("Profile not found");
    if (!data.is_active || data.purged_at) throw new Error("Unauthorized");
    return {
      id: data.id,
      username: data.username,
      role: data.role,
      displayName: data.display_name
    };
  });
}
