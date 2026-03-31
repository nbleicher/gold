import { createClient, type Client, type InArgs } from "@libsql/client";
import { env } from "./env.js";

export const db: Client = createClient({
  url: env.tursoDatabaseUrl,
  authToken: env.tursoAuthToken
});

export async function q<T = Record<string, unknown>>(
  sql: string,
  args?: InArgs
) {
  const res = args === undefined ? await db.execute(sql) : await db.execute({ sql, args });
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  args?: InArgs
) {
  const rows = await q<T>(sql, args);
  return rows[0] ?? null;
}
