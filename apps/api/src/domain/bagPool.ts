export const VIRTUAL_POOL_BATCH_IDS = {
  gold: "00000000000000000000000000000001",
  silver: "00000000000000000000000000000002"
} as const;

export type PoolMetal = keyof typeof VIRTUAL_POOL_BATCH_IDS;

export const METAL_POOL_COST_BASIS_METHOD = "metal_pool_dca" as const;
export const LEGACY_BATCH_COST_BASIS_METHOD = "batch_components" as const;

export function virtualPoolBatchIdForMetal(metal: "gold" | "silver"): string {
  return VIRTUAL_POOL_BATCH_IDS[metal];
}

export function isVirtualPoolBatchId(batchId: string): boolean {
  return batchId === VIRTUAL_POOL_BATCH_IDS.gold || batchId === VIRTUAL_POOL_BATCH_IDS.silver;
}
