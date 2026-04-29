import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBatchMap,
  buildComponentsByOrder,
  buildOrderBySticker,
  cogsForItem,
  type StreamItemCogsInput
} from "./streamCogs.js";

test("break raw line uses spot_value as COGS when batch_id is null", () => {
  const batchById = buildBatchMap([]);
  const item: StreamItemCogsInput = {
    id: "ib",
    stream_id: "s1",
    sale_type: "raw",
    batch_id: null,
    weight_grams: 1,
    sticker_code: null,
    break_id: "brk1",
    spot_value: 2.5
  };
  const c = cogsForItem(item, batchById, new Map(), new Map());
  assert.equal(c, 2.5);
});

test("raw sale COGS is proportional to batch cost per gram", () => {
  const batchById = buildBatchMap([{ id: "b1", total_cost: 310, grams: 31.1035 }]);
  const item: StreamItemCogsInput = {
    id: "i1",
    stream_id: "s1",
    sale_type: "raw",
    batch_id: "b1",
    weight_grams: 15.55175,
    sticker_code: null
  };
  const c = cogsForItem(item, batchById, new Map(), new Map());
  assert.ok(Math.abs(c - 155) < 0.02);
});

test("sticker sale sums COGS from bag_order_components", () => {
  const batchById = buildBatchMap([
    { id: "p", total_cost: 100, grams: 10 },
    { id: "q", total_cost: 200, grams: 20 }
  ]);
  const orderBySticker = buildOrderBySticker([
    { id: "bo1", primary_batch_id: "p", actual_weight_grams: 3, sticker_code: "A10A" }
  ]);
  const comps = buildComponentsByOrder([
    { bag_order_id: "bo1", batch_id: "p", weight_grams: 2 },
    { bag_order_id: "bo1", batch_id: "q", weight_grams: 1 }
  ]);
  const item: StreamItemCogsInput = {
    id: "i2",
    stream_id: "s1",
    sale_type: "sticker",
    batch_id: "p",
    weight_grams: 3,
    sticker_code: "A10A"
  };
  const c = cogsForItem(item, batchById, orderBySticker, comps);
  assert.equal(c, 30);
});

test("sticker without components uses primary batch and actual_weight_grams", () => {
  const batchById = buildBatchMap([{ id: "p", total_cost: 50, grams: 5 }]);
  const orderBySticker = buildOrderBySticker([
    { id: "bo2", primary_batch_id: "p", actual_weight_grams: 2.5, sticker_code: "B1" }
  ]);
  const item: StreamItemCogsInput = {
    id: "i3",
    stream_id: "s1",
    sale_type: "sticker",
    batch_id: "p",
    weight_grams: 2.5,
    sticker_code: "b1"
  };
  const c = cogsForItem(item, batchById, orderBySticker, new Map());
  assert.equal(c, 25);
});

test("commission payroll total scales net by rate", () => {
  const totalNet = 1000;
  const commissionPercent = 12.5;
  const commissionAmount = totalNet * (commissionPercent / 100);
  assert.equal(commissionAmount, 125);
});
