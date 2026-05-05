#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@libsql/client";
import pg from "pg";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN || !DATABASE_URL) {
  throw new Error("Missing TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, or DATABASE_URL");
}

const turso = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("sslmode=") ? undefined : { rejectUnauthorized: false }
});

const tables = [
  "users",
  "inventory_batches",
  "bag_orders",
  "bag_order_components",
  "streams",
  "stream_items",
  "schedules",
  "expenses",
  "payroll_records",
  "breaks",
  "break_prize_slots",
  "break_spots",
  "stream_breaks"
];

for (const table of tables) {
  const [tr, pr] = await Promise.all([
    turso.execute(`select count(*) as c from ${table}`),
    pool.query(`select count(*) as c from ${table}`)
  ]);
  const tursoCount = Number(tr.rows[0].c ?? 0);
  const pgCount = Number(pr.rows[0].c ?? 0);
  const status = tursoCount === pgCount ? "ok" : "mismatch";
  console.log(`${status} ${table}: turso=${tursoCount} supabase=${pgCount}`);
}

await pool.end();
