#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import pg from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

const inputPath = process.argv[2] ?? "./legacy-export.json";
const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
const { Pool } = pg;
const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("sslmode=") ? undefined : { rejectUnauthorized: false }
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
  await db.query({
    text: `insert into users (id, email, password_hash, role, display_name)
          values ($1, $2, $3, $4, $5)
          on conflict(email) do nothing`,
    values: [u.id, email, hash, u.isAdmin ? "admin" : "user", u.username ?? null]
  });
}

for (const b of inventory) {
  await db.query({
    text: `insert into inventory_batches (id, date, metal, grams, remaining_grams, purchase_spot, total_cost, batch_name, sticker_batch_letter)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    values: [
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
  await db.query({
    text: `insert into bag_orders (id, primary_batch_id, metal, actual_weight_grams, tier_index, sticker_code)
          values ($1, $2, $3, $4, $5, $6)`,
    values: [o.id, o.batchId, o.metal ?? "gold", o.actualWeightGrams, o.tierIndex, String(o.stickerCode ?? "").toUpperCase()]
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
    await db.query({
      text: "insert into bag_order_components (bag_order_id, batch_id, metal, weight_grams) values ($1, $2, $3, $4)",
      values: [c.bag_order_id, c.batch_id, c.metal, c.weight_grams]
    });
  }
}

for (const st of streams) {
  await db.query({
    text: `insert into streams (id, user_id, started_at, ended_at, gold_batch_id, silver_batch_id)
          values ($1, $2, $3, $4, $5, $6)`,
    values: [
      st.id,
      st.userId,
      new Date(st.startedAt).toISOString(),
      st.endedAt ? new Date(st.endedAt).toISOString() : null,
      st.goldBatchId ?? null,
      st.silverBatchId ?? null
    ]
  });

  for (const item of st.items ?? []) {
    await db.query({
      text: `insert into stream_items (stream_id, sale_type, name, metal, weight_grams, spot_value, spot_price, sticker_code, batch_id)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      values: [
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
    await db.query({
      text: "insert into schedules (id, date, start_time, streamer_id) values ($1, $2, $3, $4)",
      values: [slot.id, date, slot.startTime, slot.streamerId]
    });
  }
}

for (const ex of expenses) {
  await db.query({
    text: "insert into expenses (id, date, name, cost) values ($1, $2, $3, $4)",
    values: [ex.id, ex.date, ex.name, ex.cost]
  });
}

for (const p of payroll) {
  await db.query({
    text: "insert into payroll_records (id, user_id, filename, rows, imported_at) values ($1, $2, $3, $4, $5)",
    values: [p.id, p.userId, p.filename, p.rows, p.importedAt ? new Date(p.importedAt).toISOString() : new Date().toISOString()]
  });
}

const [invCount, bagCount, streamCount] = await Promise.all([
  db.query("select count(*) as c from inventory_batches"),
  db.query("select count(*) as c from bag_orders"),
  db.query("select count(*) as c from streams")
]);

console.log("Reconciliation", {
  inventorySource: inventory.length,
  inventoryTarget: Number(invCount.rows[0].c),
  bagOrdersSource: bagOrders.length,
  bagOrdersTarget: Number(bagCount.rows[0].c),
  streamsSource: streams.length,
  streamsTarget: Number(streamCount.rows[0].c)
});

await db.end();
