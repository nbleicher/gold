import { z } from "zod";

export const roleSchema = z.enum(["admin", "user"]);
export type Role = z.infer<typeof roleSchema>;

export const metalSchema = z.enum(["gold", "silver", "mixed"]);
export type Metal = z.infer<typeof metalSchema>;

const hexBatchIdSchema = z.string().regex(/^[a-f0-9]{32}$/, "Invalid batch id");
export const batchIdSchema = z.union([hexBatchIdSchema, z.string().uuid()]);
/** Same format as DB `streams.id` (hex) or RFC UUID. */
export const streamIdSchema = batchIdSchema;

export const bagComponentSchema = z.object({
  batchId: batchIdSchema,
  metal: z.enum(["gold", "silver"]),
  weightGrams: z.number().positive()
});
export type BagComponent = z.infer<typeof bagComponentSchema>;

export const createBagOrderSchema = z
  .object({
    primaryBatchId: batchIdSchema,
    primaryMetal: z.enum(["gold", "silver"]),
    primaryWeightGrams: z.number().positive(),
    secondBatchId: batchIdSchema.optional(),
    secondMetal: z.enum(["gold", "silver"]).optional(),
    secondWeightGrams: z.number().positive().optional()
  })
  .superRefine((input, ctx) => {
    const secondFields = [input.secondBatchId, input.secondMetal, input.secondWeightGrams];
    const presentCount = secondFields.filter((value) => value !== undefined).length;
    if (presentCount > 0 && presentCount < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "secondBatchId, secondMetal, and secondWeightGrams must all be provided together"
      });
    }
  });
export type CreateBagOrderInput = z.infer<typeof createBagOrderSchema>;

export const createRawSaleSchema = z.object({
  streamId: streamIdSchema,
  metal: z.enum(["gold", "silver"]),
  weightGrams: z.number().positive()
});
export type CreateRawSaleInput = z.infer<typeof createRawSaleSchema>;

export const createStickerSaleSchema = z.object({
  streamId: streamIdSchema,
  stickerCode: z.string().min(2).max(20)
});
export type CreateStickerSaleInput = z.infer<typeof createStickerSaleSchema>;
