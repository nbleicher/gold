import test from "node:test";
import assert from "node:assert/strict";
import { createBagOrderSchema } from "@gold/shared";

const primaryPayload = {
  primaryMetal: "gold" as const,
  primaryWeightGrams: 0.2
};

test("createBagOrderSchema accepts single-metal payload", () => {
  const result = createBagOrderSchema.safeParse(primaryPayload);
  assert.equal(result.success, true);
});

test("createBagOrderSchema requires second metal fields together", () => {
  const result = createBagOrderSchema.safeParse({
    ...primaryPayload,
    secondWeightGrams: 0.1
  });
  assert.equal(result.success, false);
});

test("createBagOrderSchema rejects duplicate metals in mixed payload", () => {
  const result = createBagOrderSchema.safeParse({
    ...primaryPayload,
    secondMetal: "gold" as const,
    secondWeightGrams: 0.1
  });
  assert.equal(result.success, false);
});

test("createBagOrderSchema accepts complete mixed payload", () => {
  const mixedResult = createBagOrderSchema.safeParse({
    ...primaryPayload,
    secondMetal: "silver" as const,
    secondWeightGrams: 0.1
  });
  assert.equal(mixedResult.success, true);
});
