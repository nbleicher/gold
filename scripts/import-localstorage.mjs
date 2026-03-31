#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const inputPath = process.argv[2] ?? "./legacy-export.json";
const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
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

console.log("Import started", {
  inventory: inventory.length,
  bagOrders: bagOrders.length,
  streams: streams.length
});

for (const b of inventory) {
  await db.from("inventory_batches").insert({
    id: b.id,
    date: b.date,
    metal: b.metal,
    grams: b.grams,
    remaining_grams: b.remainingGrams ?? b.grams,
    purchase_spot: b.purchaseSpot ?? 0,
    total_cost: b.totalCost ?? 0,
    sticker_batch_letter: b.stickerBatchLetter ?? "A"
  });
}

for (const o of bagOrders) {
  const { data: order } = await db
    .from("bag_orders")
    .insert({
      id: o.id,
      primary_batch_id: o.batchId,
      metal: o.metal ?? "gold",
      actual_weight_grams: o.actualWeightGrams,
      tier_index: o.tierIndex,
      sticker_code: String(o.stickerCode ?? "").toUpperCase()
    })
    .select("*")
    .single();
  const comps =
    o.components?.length > 0
      ? o.components.map((c) => ({
          bag_order_id: order.id,
          batch_id: c.batchId,
          metal: c.metal,
          weight_grams: c.weightGrams
        }))
      : [
          {
            bag_order_id: order.id,
            batch_id: o.batchId,
            metal: o.metal === "silver" ? "silver" : "gold",
            weight_grams: o.actualWeightGrams
          }
        ];
  await db.from("bag_order_components").insert(comps);
}

for (const st of streams) {
  const { data: stream } = await db
    .from("streams")
    .insert({
      id: st.id,
      user_id: st.userId,
      started_at: new Date(st.startedAt).toISOString(),
      ended_at: st.endedAt ? new Date(st.endedAt).toISOString() : null,
      gold_batch_id: st.goldBatchId ?? null,
      silver_batch_id: st.silverBatchId ?? null
    })
    .select("*")
    .single();

  for (const item of st.items ?? []) {
    await db.from("stream_items").insert({
      stream_id: stream.id,
      sale_type: item.saleType ?? "raw",
      name: item.name ?? "",
      metal: item.metal ?? "gold",
      weight_grams: item.weightGrams ?? 0,
      spot_value: item.spotValue ?? 0,
      spot_price: item.spotPrice ?? 0,
      sticker_code: item.stickerCode ?? null,
      batch_id: item.batchId ?? null
    });
  }
}

for (const [date, slots] of Object.entries(schedule)) {
  for (const slot of slots) {
    await db.from("schedules").insert({
      id: slot.id,
      date,
      start_time: slot.startTime,
      streamer_id: slot.streamerId
    });
  }
}

for (const ex of expenses) {
  await db.from("expenses").insert({
    id: ex.id,
    date: ex.date,
    name: ex.name,
    cost: ex.cost
  });
}

for (const p of payroll) {
  await db.from("payroll_records").insert({
    id: p.id,
    user_id: p.userId,
    filename: p.filename,
    rows: p.rows,
    imported_at: p.importedAt ? new Date(p.importedAt).toISOString() : new Date().toISOString()
  });
}

const [invCount, bagCount, streamCount] = await Promise.all([
  db.from("inventory_batches").select("*", { count: "exact", head: true }),
  db.from("bag_orders").select("*", { count: "exact", head: true }),
  db.from("streams").select("*", { count: "exact", head: true })
]);

console.log("Reconciliation", {
  inventorySource: inventory.length,
  inventoryTarget: invCount.count,
  bagOrdersSource: bagOrders.length,
  bagOrdersTarget: bagCount.count,
  streamsSource: streams.length,
  streamsTarget: streamCount.count
});
