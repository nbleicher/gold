import test from "node:test";
import assert from "node:assert/strict";
import { getTierIndex, seqFromIndex } from "./tiers.js";

test("getTierIndex assigns expected ranges", () => {
  assert.equal(getTierIndex(0.05), 1);
  assert.equal(getTierIndex(0.95), 10);
  assert.equal(getTierIndex(1.2), 11);
  assert.equal(getTierIndex(1.7), 12);
  assert.equal(getTierIndex(2.5), 13);
});

test("seqFromIndex increments alpha sequence", () => {
  assert.equal(seqFromIndex(0), "A");
  assert.equal(seqFromIndex(25), "Z");
  assert.equal(seqFromIndex(26), "AA");
});
