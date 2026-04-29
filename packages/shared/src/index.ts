import { z } from "zod";

export const roleSchema = z.enum(["admin", "streamer", "shipper", "bagger"]);
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

export const breakPrizeSlotInputSchema = z.object({
  slotNumber: z.number().int().min(1).max(100),
  slotType: z.enum(["normal", "mega", "prize"]),
  metal: z.enum(["gold", "silver"]),
  grams: z.number().positive(),
  cost: z.number().nonnegative()
});
export type BreakPrizeSlotInput = z.infer<typeof breakPrizeSlotInputSchema>;

const breakGeometryRefine = (
  input: { totalSpots: number; floorSilverSpots: number; prizeSlots: { slotNumber: number }[] },
  ctx: z.RefinementCtx
) => {
  const { totalSpots, floorSilverSpots, prizeSlots } = input;
  if (floorSilverSpots + prizeSlots.length !== totalSpots) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "floorSilverSpots plus prize slot count must equal totalSpots"
    });
  }
  const numbers = new Set<number>();
  for (const slot of prizeSlots) {
    if (numbers.has(slot.slotNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate slotNumber ${slot.slotNumber}`
      });
    }
    numbers.add(slot.slotNumber);
  }
};

export const createBreakSchema = z
  .object({
    name: z.string().min(1).max(120),
    totalSpots: z.number().int().min(2).max(200),
    floorSilverSpots: z.number().int().min(0).max(200),
    prizeSlots: z.array(breakPrizeSlotInputSchema).min(1).max(100)
  })
  .superRefine(breakGeometryRefine);
export type CreateBreakInput = z.infer<typeof createBreakSchema>;

export const updateBreakSchema = z
  .object({
    name: z.string().min(1).max(120),
    totalSpots: z.number().int().min(2).max(200),
    floorSilverSpots: z.number().int().min(0).max(200),
    prizeSlots: z.array(breakPrizeSlotInputSchema).min(1).max(100),
    status: z.enum(["draft", "active", "completed"]).optional()
  })
  .superRefine(breakGeometryRefine);
export type UpdateBreakInput = z.infer<typeof updateBreakSchema>;

export const startStreamBreakSchema = z.object({
  breakId: batchIdSchema,
  floorSpots: z.number().int().min(0).max(500)
});
export type StartStreamBreakInput = z.infer<typeof startStreamBreakSchema>;

export const processBreakSpotSchema = z
  .object({
    streamId: streamIdSchema,
    streamBreakId: batchIdSchema,
    outcomeType: z.enum(["silver", "prize"]),
    prizeSlotId: batchIdSchema.optional()
  })
  .superRefine((input, ctx) => {
    if (input.outcomeType === "prize" && !input.prizeSlotId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prizeSlotId"],
        message: "prizeSlotId is required for prize spots"
      });
    }
  });
export type ProcessBreakSpotInput = z.infer<typeof processBreakSpotSchema>;
