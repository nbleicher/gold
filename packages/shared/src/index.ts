import { z } from "zod";

export const roleSchema = z.enum(["admin", "streamer", "shipper", "bagger"]);
export type Role = z.infer<typeof roleSchema>;

export const metalSchema = z.enum(["gold", "silver", "mixed"]);
export type Metal = z.infer<typeof metalSchema>;

/** Troy ounce → grams (matches API stream/break valuation math). */
export const TROY_OUNCES_TO_GRAMS = 31.1034768;

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
    primaryMetal: z.enum(["gold", "silver"]),
    primaryWeightGrams: z.number().positive(),
    secondMetal: z.enum(["gold", "silver"]).optional(),
    secondWeightGrams: z.number().positive().optional()
  })
  .superRefine((input, ctx) => {
    const secondFields = [input.secondMetal, input.secondWeightGrams];
    const presentCount = secondFields.filter((value) => value !== undefined).length;
    if (presentCount > 0 && presentCount < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "secondMetal and secondWeightGrams must be provided together"
      });
    }
    if (input.secondMetal && input.secondMetal === input.primaryMetal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "secondMetal must differ from primaryMetal"
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

/** @deprecated Legacy prize-slot shape; templates use templateRows. */
export const breakPrizeSlotInputSchema = z.object({
  slotNumber: z.number().int().min(1).max(100),
  slotType: z.enum(["normal", "mega", "prize"]),
  metal: z.enum(["gold", "silver"]),
  grams: z.number().positive(),
  cost: z.number().nonnegative()
});
export type BreakPrizeSlotInput = z.infer<typeof breakPrizeSlotInputSchema>;

export const breakTemplateRowInputSchema = z.object({
  spotType: z.enum(["floor", "prize"]),
  metal: z.enum(["gold", "silver"]),
  grams: z.number().positive(),
  quantity: z.number().int().min(1).max(200)
});
export type BreakTemplateRowInput = z.infer<typeof breakTemplateRowInputSchema>;

const templateRowsQuantityRefine = (
  input: { templateRows: { quantity: number }[] },
  ctx: z.RefinementCtx
) => {
  const totalQty = input.templateRows.reduce((s, r) => s + r.quantity, 0);
  if (totalQty < 2 || totalQty > 200) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sum of row quantities must be between 2 and 200 (total spots)"
    });
  }
};

export const createBreakSchema = z
  .object({
    name: z.string().min(1).max(120),
    templateRows: z.array(breakTemplateRowInputSchema).min(1).max(100)
  })
  .superRefine(templateRowsQuantityRefine);
export type CreateBreakInput = z.infer<typeof createBreakSchema>;

export const updateBreakSchema = z
  .object({
    name: z.string().min(1).max(120),
    templateRows: z.array(breakTemplateRowInputSchema).min(1).max(100),
    status: z.enum(["draft", "active", "completed"]).optional()
  })
  .superRefine(templateRowsQuantityRefine);
export type UpdateBreakInput = z.infer<typeof updateBreakSchema>;

/** floorSpots = floor spots remaining when the run starts (streamer snapshot for tracking; not auto-updated). */
export const startStreamBreakSchema = z.object({
  breakId: batchIdSchema,
  floorSpots: z.number().int().min(0).max(500)
});
export type StartStreamBreakInput = z.infer<typeof startStreamBreakSchema>;

export const processBreakSpotSchema = z
  .object({
    streamId: streamIdSchema,
    streamBreakId: batchIdSchema,
    /** Legacy breaks only — omitted when the next spot has template-driven spot_kind. */
    outcomeType: z.enum(["silver", "prize"]).optional(),
    prizeSlotId: batchIdSchema.optional()
  })
  .superRefine((input, ctx) => {
    if (input.outcomeType === "prize" && !input.prizeSlotId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizeSlotId"],
        message: "prizeSlotId is required for legacy prize spots"
      });
    }
  });
export type ProcessBreakSpotInput = z.infer<typeof processBreakSpotSchema>;
