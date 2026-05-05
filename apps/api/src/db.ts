import { Pool, type PoolClient } from "pg";
import { env } from "./env.js";

export type InArgs = ReadonlyArray<unknown>;

export type Transaction = {
  query: <T = any>(sql: string, args?: InArgs) => Promise<T[]>;
};

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseUrl.includes("sslmode=") ? undefined : { rejectUnauthorized: false }
});

function normalizeSql(sql: string): string {
  const withDates = sql
    .replace(/datetime\('now'\)/g, "now()")
    .replace(/datetime\('now',\s*'localtime'\)/g, "now()")
    .replace(/date\('now'\)/g, "current_date")
    .replace(/\bifnull\s*\(/g, "coalesce(")
    .replace(/\bmax\(\s*0\s*,/g, "greatest(0,");

  let idx = 1;
  return withDates.replace(/\?/g, () => `$${idx++}`);
}

function normalizeArgs(args?: InArgs): unknown[] {
  if (!args) return [];
  return [...args];
}

export async function q<T = any>(
  sql: string,
  args?: InArgs
) {
  const text = normalizeSql(sql);
  const values = normalizeArgs(args);
  const res = await pool.query(text, values);
  return res.rows;
}

export async function one<T = any>(
  sql: string,
  args?: InArgs
) {
  const rows = await q<T>(sql, args);
  return rows[0] ?? null;
}

async function txQuery<T = any>(
  client: PoolClient,
  sql: string,
  args?: InArgs
) {
  const text = normalizeSql(sql);
  const values = normalizeArgs(args);
  const res = await client.query(text, values);
  return res.rows;
}

export async function txQ<T = any>(
  tx: Transaction,
  sql: string,
  args?: InArgs
) {
  return tx.query<T>(sql, args);
}

export async function txOne<T = any>(
  tx: Transaction,
  sql: string,
  args?: InArgs
) {
  const rows = await txQ<T>(tx, sql, args);
  return rows[0] ?? null;
}

export async function withWriteTx<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const tx: Transaction = {
      query: <R = any>(sql: string, args?: InArgs) => txQuery<R>(client, sql, args)
    };
    const result = await run(tx);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
