import test from "node:test";
import assert from "node:assert/strict";
import { createBreakSchema, processBreakSpotSchema } from "@gold/shared";

const minimalBreak = {
  name: "Thursday Night Break",
  templateRows: [
    { spotType: "floor" as const, metal: "silver" as const, grams: 1, quantity: 1 },
    { spotType: "prize" as const, metal: "silver" as const, grams: 1, quantity: 1 }
  ]
};

test("createBreakSchema accepts template rows with total qty in range", () => {
  const parsed = createBreakSchema.safeParse(minimalBreak);
  assert.equal(parsed.success, true);
});

test("createBreakSchema rejects when sum of quantities not in 2..200", () => {
  const parsed = createBreakSchema.safeParse({
    name: "Bad",
    templateRows: [{ spotType: "floor" as const, metal: "silver" as const, grams: 1, quantity: 1 }]
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
