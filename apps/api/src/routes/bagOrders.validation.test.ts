import test from "node:test";
import assert from "node:assert/strict";
import { createBagOrderSchema } from "@gold/shared";

const primaryPayload = {
  primaryBatchId: "0123456789abcdef0123456789abcdef",
  primaryMetal: "gold" as const,
  primaryWeightGrams: 0.2
};

test("createBagOrderSchema accepts 32-char hex primaryBatchId", () => {
  const result = createBagOrderSchema.safeParse(primaryPayload);
  assert.equal(result.success, true);
});

test("createBagOrderSchema rejects invalid primaryBatchId format", () => {
  const result = createBagOrderSchema.safeParse({
    ...primaryPayload,
    primaryBatchId: "not-a-valid-batch-id"
  });
  assert.equal(result.success, false);
});

test("createBagOrderSchema requires all mixed secondary fields together", () => {
  const result = createBagOrderSchema.safeParse({
    ...primaryPayload,
    secondBatchId: "fedcba9876543210fedcba9876543210"
  });
  assert.equal(result.success, false);
});

test("createBagOrderSchema accepts complete mixed and single-metal payloads", () => {
  const mixedResult = createBagOrderSchema.safeParse({
    ...primaryPayload,
    secondBatchId: "fedcba9876543210fedcba9876543210",
    secondMetal: "silver" as const,
    secondWeightGrams: 0.1
  });
  assert.equal(mixedResult.success, true);

  const singleResult = createBagOrderSchema.safeParse(primaryPayload);
  assert.equal(singleResult.success, true);
});
