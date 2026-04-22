import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getTierIndex } from "../lib/tiers";
import { printLabel } from "../utils/printLabel";

type Batch = {
  id: string;
  batch_name: string | null;
  metal: "gold" | "silver";
  remaining_grams: number;
};

type BagComponent = { batch_id: string; metal: string; weight_grams: number };
type BagOrder = {
  id: string;
  primary_batch_id: string;
  metal: string;
  actual_weight_grams: number;
  tier_index: number;
  sticker_code: string;
  created_at: string;
  sold: boolean;
  bag_order_components: BagComponent[];
};

function batchLabel(order: BagOrder, batches: Batch[]): string {
  const comps = order.bag_order_components ?? [];
  if (!comps.length) return "—";
  return comps
    .map((c) => {
      const bx = batches.find((b) => b.id === c.batch_id);
      const name = bx?.batch_name ?? "—";
      return `${name} (${Number(c.weight_grams).toFixed(4)}g)`;
    })
    .join(" + ");
}

export function OrdersPage() {
  const qc = useQueryClient();
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [primaryBatchId, setPrimaryBatchId] = useState("");
  const [primaryWeight, setPrimaryWeight] = useState("");
  const [mixed, setMixed] = useState(false);
  const [secondBatchId, setSecondBatchId] = useState("");
  const [secondWeight, setSecondWeight] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });

  const bagOrders = useQuery({
    queryKey: ["bag-orders"],
    queryFn: () => api<BagOrder[]>("/v1/bag-orders")
  });

  const secondMetal: "gold" | "silver" = metal === "gold" ? "silver" : "gold";

  const primaryChoices = useMemo(
    () =>
      (batches.data ?? []).filter((b) => b.metal === metal && Number(b.remaining_grams) > 0),
    [batches.data, metal]
  );

  const secondChoices = useMemo(
    () =>
      (batches.data ?? []).filter((b) => b.metal === secondMetal && Number(b.remaining_grams) > 0),
    [batches.data, secondMetal]
  );

  const tierPreview = useMemo(() => {
    const w = Number(primaryWeight) || 0;
    const w2 = mixed ? Number(secondWeight) || 0 : 0;
    const total = w + w2;
    if (!(total > 0)) return "Enter weight to preview tier.";
    const t = getTierIndex(total);
    if (t == null) return "Weight outside configured tiers.";
    return `Matched tier index: ${t} (total ${total.toFixed(4)} g${mixed ? `, primary ${w.toFixed(4)} g + second ${w2.toFixed(4)} g` : ""})`;
  }, [primaryWeight, secondWeight, mixed]);

  const createBag = useMutation({
    mutationFn: () => {
      const primary = (batches.data ?? []).find((b) => b.id === primaryBatchId);
      if (!primary) throw new Error("Select primary batch");
      const secondary = mixed ? (batches.data ?? []).find((b) => b.id === secondBatchId) : undefined;
      if (mixed && !secondary) throw new Error("Select second metal batch");
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
      setPrimaryWeight("");
      setSecondWeight("");
      setFormError(null);
    }
  });

  const markSold = useMutation({
    mutationFn: (id: string) => api(`/v1/bag-orders/${id}/mark-sold`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bag-orders"] })
  });

  const removeBag = useMutation({
    mutationFn: (id: string) => api(`/v1/bag-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bag-orders"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
    }
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const primaryWeightNumber = Number(primaryWeight);
    const secondWeightNumber = Number(secondWeight);
    if (!primaryBatchId) return setFormError("Select a primary batch.");
    if (!(primaryWeightNumber > 0)) return setFormError("Enter a primary weight greater than 0.");
    if (mixed) {
      if (!secondBatchId) return setFormError("Select a second metal batch.");
      if (!(secondWeightNumber > 0)) return setFormError("Enter a second metal weight greater than 0.");
    }
    setFormError(null);
    createBag.mutate();
  };

  return (
    <section className="card">
      <h2>Inventory Management</h2>
      <p
        className="pg-sub"
        style={{
          marginBottom: "1.25rem",
          fontSize: "0.58rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-dim)"
        }}
      >
        Bag from a batch · weight sets tier · sticker code auto-assigned
      </p>
      <p
        style={{
          fontSize: "0.58rem",
          color: "var(--muted)",
          marginBottom: "1.25rem",
          lineHeight: 1.5,
          maxWidth: "42rem"
        }}
      >
        Sticker codes use the primary batch&apos;s sticker letter (set in Batch Management), the tier digit from
        total bag weight, and a sequence letter for each bag in that batch and tier (A, B, …).
      </p>

      {batches.error || bagOrders.error ? (
        <p className="error">{String((batches.error ?? bagOrders.error) as Error)}</p>
      ) : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          NEW BAG
        </div>
        <form onSubmit={onSubmit}>
          <div className="grid-form" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div className="form-group" style={{ minWidth: 120 }}>
              <label className="form-label">Metal</label>
              <select
                className="form-input"
                value={metal}
                onChange={(e) => {
                  setMetal(e.target.value as "gold" | "silver");
                  setPrimaryBatchId("");
                  setSecondBatchId("");
                }}
              >
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: "2 1 200px", minWidth: 200 }}>
              <label className="form-label">Batch</label>
              <select
                className="form-input"
                value={primaryBatchId}
                onChange={(e) => setPrimaryBatchId(e.target.value)}
              >
                <option value="">{primaryChoices.length ? "Select batch" : `No ${metal} batches with stock`}</option>
                {primaryChoices.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batch_name ?? b.id} · {Number(b.remaining_grams).toFixed(4)}g left
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label className="form-label">Weight (g)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step="0.0001"
                placeholder="grams"
                value={primaryWeight}
                onChange={(e) => setPrimaryWeight(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-gold" disabled={createBag.isPending} style={{ alignSelf: "flex-end" }}>
              Create sticker
            </button>
          </div>
          <label
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.68rem",
              color: "var(--text-dim)",
              marginTop: "0.75rem"
            }}
          >
            <input
              type="checkbox"
              checked={mixed}
              onChange={(e) => {
                setMixed(e.target.checked);
                setFormError(null);
              }}
            />
            Add second metal to same bag (gold + silver)
          </label>
          {mixed ? (
            <div className="grid-form" style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              <div className="form-group" style={{ minWidth: 180 }}>
                <label className="form-label">Second metal batch</label>
                <select className="form-input" value={secondBatchId} onChange={(e) => setSecondBatchId(e.target.value)}>
                  <option value="">{secondChoices.length ? "Select batch" : `No ${secondMetal} batches with stock`}</option>
                  {secondChoices.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batch_name ?? b.id} · {Number(b.remaining_grams).toFixed(4)}g left
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 140 }}>
                <label className="form-label">Second metal weight (g)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step="0.0001"
                  placeholder="grams"
                  value={secondWeight}
                  onChange={(e) => setSecondWeight(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.55rem" }}>{tierPreview}</p>
          {formError ? <p className="error">{formError}</p> : null}
          {createBag.error ? <p className="error">{(createBag.error as Error).message}</p> : null}
        </form>
      </div>

      <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
        RECENT BAGS
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Sticker</th>
              <th>Batch</th>
              <th>Metal</th>
              <th>Weight (g)</th>
              <th>Tier</th>
              <th>Created</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(bagOrders.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="tbl-empty">
                  No bag orders yet
                </td>
              </tr>
            ) : (
              (bagOrders.data ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="tbl-gold">{o.sticker_code}</td>
                  <td>{batchLabel(o, batches.data ?? [])}</td>
                  <td>{o.metal[0].toUpperCase() + o.metal.slice(1)}</td>
                  <td>{Number(o.actual_weight_grams).toFixed(4)}</td>
                  <td>{o.tier_index}</td>
                  <td style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td>
                    {o.sold ? (
                      <span className="badge badge-evening">Sold</span>
                    ) : (
                      <span className="badge badge-morning">Open</span>
                    )}
                  </td>
                  <td>
                    {!o.sold ? (
                      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={markSold.isPending || removeBag.isPending}
                          onClick={() => markSold.mutate(o.id)}
                        >
                          Mark sold
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={removeBag.isPending || markSold.isPending}
                          onClick={() => {
                            const ok = window.confirm(`Remove bag ${o.sticker_code}? This will restock its grams.`);
                            if (!ok) return;
                            removeBag.mutate(o.id);
                          }}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          title="Print label"
                          onClick={() => printLabel(o.sticker_code, Number(o.actual_weight_grams))}
                        >
                          Print
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {removeBag.error ? <p className="error">{(removeBag.error as Error).message}</p> : null}
    </section>
  );
}
