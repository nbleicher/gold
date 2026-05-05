#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@libsql/client";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
const OUTPUT = process.argv[2] ?? "./turso-export.json";

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
}

const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

const TABLES = [
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
  "stream_breaks",
  "spot_snapshots",
  "metal_inventory_pool"
];

const payload = {};
for (const table of TABLES) {
  const res = await db.execute(`select * from ${table}`);
  payload[table] = res.rows;
}

await fs.writeFile(
  OUTPUT,
  JSON.stringify({ exportedAt: new Date().toISOString(), tables: payload }, null, 2),
  "utf8"
);

console.log(`Wrote export to ${OUTPUT}`);
