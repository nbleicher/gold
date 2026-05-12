import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getTierIndex } from "../lib/tiers";
import { printLabel, LABEL_PRINT_SETUP_HINT } from "../utils/printLabel";

type Batch = {
  id: string;
  batch_name: string | null;
  metal: "gold" | "silver";
  remaining_grams: number;
};

type MetalPool = {
  gold: { gramsOnHand: number; avgCostPerGram: number };
  silver: { gramsOnHand: number; avgCostPerGram: number };
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

function sourceLabel(order: BagOrder, batches: Batch[]): string {
  const comps = order.bag_order_components ?? [];
  if (!comps.length) return "Metal pool";
  return comps
    .map((c) => {
      const bx = batches.find((b) => b.id === c.batch_id);
      const name = bx?.batch_name ?? "Batch";
      return `${name} (${Number(c.weight_grams).toFixed(4)}g)`;
    })
    .join(" + ");
}

export function OrdersPage() {
  const qc = useQueryClient();
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [primaryWeight, setPrimaryWeight] = useState("");
  const [mixed, setMixed] = useState(false);
  const [secondWeight, setSecondWeight] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });

  const metalPool = useQuery({
    queryKey: ["metal-pool"],
    queryFn: () => api<MetalPool>("/v1/inventory/metal-pool")
  });

  const bagOrders = useQuery({
    queryKey: ["bag-orders"],
    queryFn: () => api<BagOrder[]>("/v1/bag-orders")
  });

  const secondMetal: "gold" | "silver" = metal === "gold" ? "silver" : "gold";

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
    mutationFn: () =>
      api<BagOrder>("/v1/bag-orders", {
        method: "POST",
        body: JSON.stringify({
          primaryMetal: metal,
          primaryWeightGrams: Number(primaryWeight),
          secondMetal: mixed ? secondMetal : undefined,
          secondWeightGrams: mixed ? Number(secondWeight) : undefined
        })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["metal-pool"] });
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
      qc.invalidateQueries({ queryKey: ["metal-pool"] });
    }
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const primaryWeightNumber = Number(primaryWeight);
    const secondWeightNumber = Number(secondWeight);
    if (!(primaryWeightNumber > 0)) return setFormError("Enter a primary weight greater than 0.");
    if (mixed && !(secondWeightNumber > 0)) {
      return setFormError("Enter a second metal weight greater than 0.");
    }
    setFormError(null);
    createBag.mutate();
  };

  const primaryPool = metalPool.data?.[metal];
  const secondPool = metalPool.data?.[secondMetal];

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
        Bag from pooled metal · weight sets tier · sticker code auto-assigned
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
        Choose metal and weight only. Grams are allocated across inventory batches automatically using the
        dollar-cost-average pool for that metal.
      </p>

      {batches.error || bagOrders.error || metalPool.error ? (
        <p className="error">{String((batches.error ?? bagOrders.error ?? metalPool.error) as Error)}</p>
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
                }}
              >
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
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
          {primaryPool ? (
            <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.55rem" }}>
              {metal[0].toUpperCase() + metal.slice(1)} pool: {Number(primaryPool.gramsOnHand).toFixed(4)}g on hand · avg $
              {Number(primaryPool.avgCostPerGram).toFixed(4)}/g
            </p>
          ) : null}
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
                <label className="form-label">Second metal</label>
                <input className="form-input" value={secondMetal[0].toUpperCase() + secondMetal.slice(1)} readOnly />
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
          {mixed && secondPool ? (
            <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.55rem" }}>
              {secondMetal[0].toUpperCase() + secondMetal.slice(1)} pool: {Number(secondPool.gramsOnHand).toFixed(4)}g on hand ·
              avg ${Number(secondPool.avgCostPerGram).toFixed(4)}/g
            </p>
          ) : null}
          <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.55rem" }}>{tierPreview}</p>
          {formError ? <p className="error">{formError}</p> : null}
          {createBag.error ? <p className="error">{(createBag.error as Error).message}</p> : null}
        </form>
      </div>

      <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
        RECENT BAGS
      </div>
      <p style={{ fontSize: "0.62rem", color: "var(--muted)", margin: "0 0 0.75rem", maxWidth: "42rem", lineHeight: 1.45 }}>
        {LABEL_PRINT_SETUP_HINT}
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Sticker</th>
              <th>Sources</th>
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
                  <td>{sourceLabel(o, batches.data ?? [])}</td>
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
