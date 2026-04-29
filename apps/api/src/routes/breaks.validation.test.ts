import test from "node:test";
import assert from "node:assert/strict";
import { createBreakSchema, processBreakSpotSchema } from "@gold/shared";

const validPrizeSlots = [
  ...Array.from({ length: 9 }, (_, i) => ({
    slotNumber: i + 1,
    slotType: "normal" as const,
    metal: "silver" as const,
    grams: 1,
    cost: 5
  })),
  {
    slotNumber: 10,
    slotType: "mega" as const,
    metal: "gold" as const,
    grams: 2,
    cost: 80
  }
];

test("createBreakSchema accepts 9 normal + 1 mega prize slots", () => {
  const parsed = createBreakSchema.safeParse({
    name: "Thursday Night Break",
    prizeSlots: validPrizeSlots
  });
  assert.equal(parsed.success, true);
});

test("createBreakSchema rejects payloads without exactly one mega slot", () => {
  const parsed = createBreakSchema.safeParse({
    name: "Invalid Break",
    prizeSlots: validPrizeSlots.map((slot) =>
      slot.slotType === "mega" ? { ...slot, slotType: "normal" as const } : slot
    )
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
