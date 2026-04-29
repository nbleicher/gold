import test from "node:test";
import assert from "node:assert/strict";
import { createBreakSchema, processBreakSpotSchema } from "@gold/shared";

const minimalBreak = {
  name: "Thursday Night Break",
  totalSpots: 2,
  floorSilverSpots: 1,
  prizeSlots: [
    {
      slotNumber: 1,
      slotType: "prize" as const,
      metal: "silver" as const,
      grams: 1,
      cost: 5
    }
  ]
};

test("createBreakSchema accepts floor + prize geometry", () => {
  const parsed = createBreakSchema.safeParse(minimalBreak);
  assert.equal(parsed.success, true);
});

test("createBreakSchema rejects when floor + prizes != totalSpots", () => {
  const parsed = createBreakSchema.safeParse({
    ...minimalBreak,
    totalSpots: 10
  });
  assert.equal(parsed.success, false);
});

test("createBreakSchema rejects duplicate slot numbers", () => {
  const parsed = createBreakSchema.safeParse({
    name: "Dup",
    totalSpots: 3,
    floorSilverSpots: 1,
    prizeSlots: [
      { slotNumber: 1, slotType: "prize" as const, metal: "silver" as const, grams: 1, cost: 0 },
      { slotNumber: 1, slotType: "prize" as const, metal: "gold" as const, grams: 1, cost: 0 }
    ]
  });
  assert.equal(parsed.success, false);
});

test("processBreakSpotSchema requires prizeSlotId for prize outcome", () => {
  const parsed = processBreakSpotSchema.safeParse({
    streamId: "0123456789abcdef0123456789abcdef",
    streamBreakId: "0123456789abcdef0123456789abcdef",
    outcomeType: "prize"
  });
  assert.equal(parsed.success, false);
});
