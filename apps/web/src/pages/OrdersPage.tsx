import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Batch = { id: string; batch_name: string; metal: "gold" | "silver"; remaining_grams: number };
type BagOrder = {
  id: string;
  sticker_code: string;
  metal: "gold" | "silver" | "mixed";
  actual_weight_grams: number;
  tier_index: number;
};

export function OrdersPage() {
  const qc = useQueryClient();
  const [primaryBatchId, setPrimaryBatchId] = useState("");
  const [primaryWeight, setPrimaryWeight] = useState("0.0000");
  const [mixed, setMixed] = useState(false);
  const [secondBatchId, setSecondBatchId] = useState("");
  const [secondWeight, setSecondWeight] = useState("0.0000");

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });
  const bagOrders = useQuery({
    queryKey: ["bag-orders"],
    queryFn: () => api<BagOrder[]>("/v1/bag-orders")
  });

  const createBag = useMutation({
    mutationFn: () => {
      const primary = (batches.data ?? []).find((b) => b.id === primaryBatchId);
      if (!primary) throw new Error("Select primary batch");
      const secondary = (batches.data ?? []).find((b) => b.id === secondBatchId);
      return api<BagOrder>("/v1/bag-orders", {
        method: "POST",
        body: JSON.stringify({
          primaryBatchId,
          primaryMetal: primary.metal,
          primaryWeightGrams: Number(primaryWeight),
          secondBatchId: mixed ? secondBatchId : undefined,
          secondMetal: mixed && secondary ? secondary.metal : undefined,
          secondWeightGrams: mixed ? Number(secondWeight) : undefined
        })
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["bag-orders"] });
    }
  });

  const deleteBag = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/bag-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["bag-orders"] });
    }
  });

  const primaryBatch = useMemo(
    () => (batches.data ?? []).find((b) => b.id === primaryBatchId),
    [batches.data, primaryBatchId]
  );
  const secondaryChoices = useMemo(
    () => (batches.data ?? []).filter((b) => b.metal !== primaryBatch?.metal),
    [batches.data, primaryBatch?.metal]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    createBag.mutate();
  };

  return (
    <section className="card">
      <h2>Orders</h2>
      <form className="grid-form" onSubmit={onSubmit}>
        <select value={primaryBatchId} onChange={(e) => setPrimaryBatchId(e.target.value)}>
          <option value="">Primary batch</option>
          {(batches.data ?? []).map((b) => (
            <option value={b.id} key={b.id}>
              {b.batch_name} ({b.metal}) · {Number(b.remaining_grams).toFixed(4)}g
            </option>
          ))}
        </select>
        <input
          value={primaryWeight}
          onChange={(e) => setPrimaryWeight(e.target.value)}
          placeholder="primary grams"
        />
        <label>
          <input type="checkbox" checked={mixed} onChange={(e) => setMixed(e.target.checked)} /> Mixed bag
        </label>
        {mixed ? (
          <>
            <select value={secondBatchId} onChange={(e) => setSecondBatchId(e.target.value)}>
              <option value="">Second batch</option>
              {secondaryChoices.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.batch_name} ({b.metal}) · {Number(b.remaining_grams).toFixed(4)}g
                </option>
              ))}
            </select>
            <input
              value={secondWeight}
              onChange={(e) => setSecondWeight(e.target.value)}
              placeholder="second grams"
            />
          </>
        ) : null}
        <button type="submit" disabled={createBag.isPending}>
          Create sticker
        </button>
      </form>
      <p>Batches available: {batches.data?.length ?? 0}</p>
      <p>Bag orders: {bagOrders.data?.length ?? 0}</p>
      <ul>
        {(bagOrders.data ?? []).slice(0, 30).map((o) => (
          <li key={o.id}>
            {o.sticker_code} · {o.metal} · {Number(o.actual_weight_grams).toFixed(4)}g · tier {o.tier_index}{" "}
            <button onClick={() => deleteBag.mutate(o.id)}>delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
