import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Batch = {
  id: string;
  date: string;
  metal: "gold" | "silver";
  grams: number;
  remaining_grams: number;
  purchase_spot: number;
  total_cost: number;
};

export function InventoryMgmtPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [grams, setGrams] = useState("0.0000");
  const [spot, setSpot] = useState("0");
  const [cost, setCost] = useState("0");

  const batches = useQuery({
    queryKey: ["inventory-batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });

  const createBatch = useMutation({
    mutationFn: () =>
      api<Batch>("/v1/inventory/batches", {
        method: "POST",
        body: JSON.stringify({
          date,
          metal,
          grams: Number(grams),
          purchaseSpot: Number(spot),
          totalCost: Number(cost)
        })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-batches"] });
    }
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    createBatch.mutate();
  };

  return (
    <section className="card">
      <h2>Inventory Management (Batches)</h2>
      <form className="grid-form" onSubmit={onSubmit}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <select value={metal} onChange={(e) => setMetal(e.target.value as "gold" | "silver")}>
          <option value="gold">Gold</option>
          <option value="silver">Silver</option>
        </select>
        <input value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="grams" />
        <input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="spot" />
        <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="cost" />
        <button type="submit" disabled={createBatch.isPending}>
          Add batch
        </button>
      </form>
      <ul>
        {(batches.data ?? []).slice(0, 50).map((b) => (
          <li key={b.id}>
            {b.date} · {b.metal} · purchased {Number(b.grams).toFixed(4)}g · remaining{" "}
            {Number(b.remaining_grams).toFixed(4)}g
          </li>
        ))}
      </ul>
    </section>
  );
}
