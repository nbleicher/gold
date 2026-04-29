export type BatchRow = { id: string; total_cost: number; grams: number };

export type StreamItemCogsInput = {
  id: string;
  stream_id: string;
  sale_type: string;
  batch_id: string | null;
  weight_grams: number;
  sticker_code: string | null;
  /** Present for break-derived raw lines (batch_id null); COGS = inventory cost stored as spot_value. */
  break_id?: string | null;
  spot_value?: number;
};

export type BagOrderRow = {
  id: string;
  primary_batch_id: string;
  actual_weight_grams: number;
  sticker_code: string;
};

export type ComponentRow = {
  bag_order_id: string;
  batch_id: string;
  weight_grams: number;
};

function cogsFromBatchGrams(batch: BatchRow | undefined, weightGrams: number): number {
  if (!batch) return 0;
  const grams = Number(batch.grams);
  const tc = Number(batch.total_cost);
  const w = Number(weightGrams);
  if (!(grams > 0) || !(w > 0) || !(tc >= 0)) return 0;
  return (tc / grams) * w;
}

/** COGS for one stream line item (raw uses batch_id; sticker uses bag components or primary batch fallback). */
export function cogsForItem(
  item: StreamItemCogsInput,
  batchById: Map<string, BatchRow>,
  orderByStickerUpper: Map<string, BagOrderRow>,
  componentsByOrderId: Map<string, ComponentRow[]>
): number {
  if (item.sale_type === "raw") {
    const b = item.batch_id ? batchById.get(item.batch_id) : undefined;
    if (b) return cogsFromBatchGrams(b, item.weight_grams);
    if (item.break_id && item.spot_value != null && Number(item.spot_value) >= 0) {
      return Number(item.spot_value);
    }
    return 0;
  }
  if (item.sale_type === "sticker") {
    const code = (item.sticker_code ?? "").trim().toUpperCase();
    if (!code) return 0;
    const order = orderByStickerUpper.get(code);
    if (!order) return 0;
    const comps = componentsByOrderId.get(order.id) ?? [];
    if (comps.length > 0) {
      let sum = 0;
      for (const c of comps) {
        sum += cogsFromBatchGrams(batchById.get(c.batch_id), c.weight_grams);
      }
      return sum;
    }
    return cogsFromBatchGrams(batchById.get(order.primary_batch_id), order.actual_weight_grams);
  }
  return 0;
}

export function cogsByItemId(
  items: StreamItemCogsInput[],
  batchById: Map<string, BatchRow>,
  orderByStickerUpper: Map<string, BagOrderRow>,
  componentsByOrderId: Map<string, ComponentRow[]>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    m.set(it.id, cogsForItem(it, batchById, orderByStickerUpper, componentsByOrderId));
  }
  return m;
}

export function totalCogsFromMap(byItemId: Map<string, number>): number {
  let s = 0;
  for (const v of byItemId.values()) s += v;
  return s;
}

export function totalSpotValue(items: Array<{ spot_value: number }>): number {
  return items.reduce((sum, it) => sum + Number(it.spot_value), 0);
}

export function buildBatchMap(rows: BatchRow[]): Map<string, BatchRow> {
  return new Map(rows.map((b) => [b.id, b]));
}

export function buildOrderBySticker(orders: BagOrderRow[]): Map<string, BagOrderRow> {
  const m = new Map<string, BagOrderRow>();
  for (const o of orders) {
    m.set(String(o.sticker_code).trim().toUpperCase(), o);
  }
  return m;
}

export function buildComponentsByOrder(rows: ComponentRow[]): Map<string, ComponentRow[]> {
  const m = new Map<string, ComponentRow[]>();
  for (const r of rows) {
    const list = m.get(r.bag_order_id) ?? [];
    list.push(r);
    m.set(r.bag_order_id, list);
  }
  return m;
}
