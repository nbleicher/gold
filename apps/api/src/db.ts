import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
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

export async function txQ<T = Record<string, unknown>>(
  tx: Transaction,
  sql: string,
  args?: InArgs
) {
  const res = args === undefined ? await tx.execute(sql) : await tx.execute({ sql, args });
  return res.rows as T[];
}

export async function txOne<T = Record<string, unknown>>(
  tx: Transaction,
  sql: string,
  args?: InArgs
) {
  const rows = await txQ<T>(tx, sql, args);
  return rows[0] ?? null;
}

export async function withWriteTx<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await db.transaction("write");
  try {
    const result = await run(tx);
    await tx.commit();
    return result;
  } catch (err) {
    if (!tx.closed) {
      try {
        await tx.rollback();
      } catch {
        // Preserve the original error from transactional work.
      }
    }
    throw err;
  } finally {
    tx.close();
  }
}
