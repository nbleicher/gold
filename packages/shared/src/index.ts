import { z } from "zod";

export const roleSchema = z.enum(["admin", "user"]);
export type Role = z.infer<typeof roleSchema>;

export const metalSchema = z.enum(["gold", "silver", "mixed"]);
export type Metal = z.infer<typeof metalSchema>;

export const bagComponentSchema = z.object({
  batchId: z.string().uuid(),
  metal: z.enum(["gold", "silver"]),
  weightGrams: z.number().positive()
});
export type BagComponent = z.infer<typeof bagComponentSchema>;

export const createBagOrderSchema = z.object({
  primaryBatchId: z.string().uuid(),
  primaryMetal: z.enum(["gold", "silver"]),
  primaryWeightGrams: z.number().positive(),
  secondBatchId: z.string().uuid().optional(),
  secondMetal: z.enum(["gold", "silver"]).optional(),
  secondWeightGrams: z.number().positive().optional()
});
export type CreateBagOrderInput = z.infer<typeof createBagOrderSchema>;

export const createRawSaleSchema = z.object({
  streamId: z.string().uuid(),
  metal: z.enum(["gold", "silver"]),
  weightGrams: z.number().positive()
});
export type CreateRawSaleInput = z.infer<typeof createRawSaleSchema>;

export const createStickerSaleSchema = z.object({
  streamId: z.string().uuid(),
  stickerCode: z.string().min(2).max(20)
});
export type CreateStickerSaleInput = z.infer<typeof createStickerSaleSchema>;
