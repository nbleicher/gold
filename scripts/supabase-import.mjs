#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const INPUT = process.argv[2] ?? "./turso-export.json";

if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("sslmode=") ? undefined : { rejectUnauthorized: false }
});

const raw = JSON.parse(await fs.readFile(INPUT, "utf8"));
const tables = raw.tables ?? {};

const importOrder = [
  "users",
  "inventory_batches",
  "bag_orders",
  "bag_order_components",
  "streams",
  "breaks",
  "stream_breaks",
  "break_prize_slots",
  "break_spots",
  "stream_items",
  "schedules",
  "expenses",
  "payroll_records",
  "spot_snapshots",
  "metal_inventory_pool"
];

const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("set session_replication_role = replica");

  for (const table of importOrder) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(
        `insert into ${table} (${colList}) values (${placeholders}) on conflict do nothing`,
        values
      );
    }
    console.log(`Imported ${rows.length} rows into ${table}`);
  }

  await client.query("set session_replication_role = origin");
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
