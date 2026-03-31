#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@libsql/client";
import bcrypt from "bcrypt";

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
}

const inputPath = process.argv[2] ?? "./legacy-export.json";
const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN
});

function fromKey(key) {
  return raw[`gs_${key}`] ?? raw[key] ?? [];
}

const inventory = fromKey("inventory");
const bagOrders = fromKey("bagOrders");
const streams = fromKey("streams");
const schedule = fromKey("schedule") ?? {};
const expenses = fromKey("expenses");
const payroll = fromKey("payroll");
const users = fromKey("users");

console.log("Import started", {
  users: users.length,
  inventory: inventory.length,
  bagOrders: bagOrders.length,
  streams: streams.length
});

for (const u of users) {
  const email = `${String(u.username ?? "user").toLowerCase()}@legacy.local`;
  const hash = await bcrypt.hash(String(u.password ?? "changeme"), 12);
  await db.execute({
    sql: `insert into users (id, email, password_hash, role, display_name)
          values (?, ?, ?, ?, ?)
          on conflict(email) do nothing`,
    args: [u.id, email, hash, u.isAdmin ? "admin" : "user", u.username ?? null]
  });
}

for (const b of inventory) {
  await db.execute({
    sql: `insert into inventory_batches (id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_name, sticker_batch_letter)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      b.id,
      b.date,
      b.metal,
      b.grams,
      b.remainingGrams ?? b.grams,
      b.purchaseSpot ?? 0,
      b.totalCost ?? 0,
      b.batchName ?? null,
      b.stickerBatchLetter ?? "A"
    ]
  });
}

for (const o of bagOrders) {
  await db.execute({
    sql: `insert into bag_orders (id, primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code)
          values (?, ?, ?, ?, ?, ?)`,
    args: [o.id, o.batchId, o.metal ?? "gold", o.actualWeightGrams, o.tierIndex, String(o.stickerCode ?? "").toUpperCase()]
  });
  const comps =
    o.components?.length > 0
      ? o.components.map((c) => ({
          bag_order_id: o.id,
          batch_id: c.batchId,
          metal: c.metal,
          weight_grams: c.weightGrams
        }))
      : [
          {
            bag_order_id: o.id,
            batch_id: o.batchId,
            metal: o.metal === "silver" ? "silver" : "gold",
            weight_grams: o.actualWeightGrams
          }
        ];
  for (const c of comps) {
    await db.execute({
      sql: "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values (?, ?, ?, ?)",
      args: [c.bag_order_id, c.batch_id, c.metal, c.weight_grams]
    });
  }
}

for (const st of streams) {
  await db.execute({
    sql: `insert into streams (id, user_id, started_at, ended_at, gold_batch_id, silver_batch_id)
          values (?, ?, ?, ?, ?, ?)`,
    args: [
      st.id,
      st.userId,
      new Date(st.startedAt).toISOString(),
      st.endedAt ? new Date(st.endedAt).toISOString() : null,
      st.goldBatchId ?? null,
      st.silverBatchId ?? null
    ]
  });

  for (const item of st.items ?? []) {
    await db.execute({
      sql: `insert into stream_items (stream_id, sale_type, name, metal, weight_grams, spot_value, spot_price, sticker_code, batch_id)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        st.id,
        item.saleType ?? "raw",
        item.name ?? "",
        item.metal ?? "gold",
        item.weightGrams ?? 0,
        item.spotValue ?? 0,
        item.spotPrice ?? 0,
        item.stickerCode ?? null,
        item.batchId ?? null
      ]
    });
  }
}

for (const [date, slots] of Object.entries(schedule)) {
  for (const slot of slots) {
    await db.execute({
      sql: "insert into schedules (id, date, start_time, streamer_id) values (?, ?, ?, ?)",
      args: [slot.id, date, slot.startTime, slot.streamerId]
    });
  }
}

for (const ex of expenses) {
  await db.execute({
    sql: "insert into expenses (id, date, name, cost) values (?, ?, ?, ?)",
    args: [ex.id, ex.date, ex.name, ex.cost]
  });
}

for (const p of payroll) {
  await db.execute({
    sql: "insert into payroll_records (id, user_id, filename, rows, imported_at) values (?, ?, ?, ?, ?)",
    args: [p.id, p.userId, p.filename, p.rows, p.importedAt ? new Date(p.importedAt).toISOString() : new Date().toISOString()]
  });
}

const [invCount, bagCount, streamCount] = await Promise.all([
  db.execute("select count(*) as c from inventory_batches"),
  db.execute("select count(*) as c from bag_orders"),
  db.execute("select count(*) as c from streams")
]);

console.log("Reconciliation", {
  inventorySource: inventory.length,
  inventoryTarget: Number(invCount.rows[0].c),
  bagOrdersSource: bagOrders.length,
  bagOrdersTarget: Number(bagCount.rows[0].c),
  streamsSource: streams.length,
  streamsTarget: Number(streamCount.rows[0].c)
});
