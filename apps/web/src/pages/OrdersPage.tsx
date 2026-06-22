import { FormEvent, useEffect, useMemo, useState } from "react";
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
  inventory_session_id: string | null;
  metal: string;
  actual_weight_grams: number;
  tier_index: number;
  sticker_code: string;
  created_at: string;
  sold: boolean;
  bag_order_components: BagComponent[];
};

type InventorySession = {
  id: string;
  user_id: string;
  metal: "gold" | "silver";
  started_at: string;
  ended_at: string | null;
  username: string;
  display_name: string | null;
};

type AdminInventorySession = InventorySession & {
  sticker_count: number;
  total_grams: number;
  bag_orders: Array<{
    id: string;
    sticker_code: string;
    metal: string;
    actual_weight_grams: number;
    tier_index: number;
    sold_at: string | null;
    created_at: string;
  }>;
  events: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: unknown;
    created_at: string;
  }>;
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
  const [sessionMetal, setSessionMetal] = useState<"gold" | "silver">("gold");
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

  const activeSession = useQuery({
    queryKey: ["inventory-session-active"],
    queryFn: () => api<InventorySession | null>("/v1/inventory/sessions/active")
  });

  const adminSessions = useQuery({
    queryKey: ["admin-inventory-sessions"],
    queryFn: () => api<AdminInventorySession[]>("/v1/admin/inventory/sessions")
  });

  const bagOrders = useQuery({
    queryKey: ["bag-orders"],
    queryFn: () => api<BagOrder[]>("/v1/bag-orders")
  });

  useEffect(() => {
    if (!activeSession.data) return;
    setMetal(activeSession.data.metal);
    setSessionMetal(activeSession.data.metal);
    setMixed(false);
  }, [activeSession.data]);

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
          secondWeightGrams: mixed ? Number(secondWeight) : undefined,
          inventorySessionId: activeSession.data?.id
        })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["metal-pool"] });
      qc.invalidateQueries({ queryKey: ["bag-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-sessions"] });
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
      qc.invalidateQueries({ queryKey: ["admin-inventory-sessions"] });
    }
  });

  const startSession = useMutation({
    mutationFn: () =>
      api<InventorySession>("/v1/inventory/sessions/start", {
        method: "POST",
        body: JSON.stringify({ metal: sessionMetal })
      }),
    onSuccess: (session) => {
      setMetal(session.metal);
      setSessionMetal(session.metal);
      setMixed(false);
      qc.invalidateQueries({ queryKey: ["inventory-session-active"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-sessions"] });
    }
  });

  const endSession = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/inventory/sessions/${id}/end`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-session-active"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-sessions"] });
    }
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!activeSession.data?.id) return setFormError("Start an inventory session before creating stickers.");
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
  const session = activeSession.data;

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

      {batches.error || bagOrders.error || metalPool.error || activeSession.error || adminSessions.error ? (
        <p className="error">{String((batches.error ?? bagOrders.error ?? metalPool.error ?? activeSession.error ?? adminSessions.error) as Error)}</p>
      ) : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          INVENTORY SESSION
        </div>
        {session ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
              Active session:{" "}
              <strong style={{ color: "var(--text)" }}>
                {session.metal[0].toUpperCase() + session.metal.slice(1)}
              </strong>{" "}
              since {new Date(session.started_at).toLocaleString()}
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={endSession.isPending}
              onClick={() => endSession.mutate(session.id)}
            >
              End session
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            <div className="form-group" style={{ minWidth: 120 }}>
              <label className="form-label">Metal</label>
              <select
                className="form-input"
                value={sessionMetal}
                onChange={(e) => setSessionMetal(e.target.value as "gold" | "silver")}
              >
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
              </select>
            </div>
            <button
              type="button"
              className="btn btn-gold"
              disabled={startSession.isPending}
              onClick={() => startSession.mutate()}
            >
              Start session
            </button>
          </div>
        )}
        {startSession.error ? <p className="error">{(startSession.error as Error).message}</p> : null}
        {endSession.error ? <p className="error">{(endSession.error as Error).message}</p> : null}
      </div>

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
                disabled={Boolean(session)}
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
            <button
              type="submit"
              className="btn btn-gold"
              disabled={createBag.isPending || !session}
              style={{ alignSelf: "flex-end" }}
            >
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
              disabled={Boolean(session)}
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
          {!session ? (
            <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.55rem" }}>
              Start an inventory session before creating stickers.
            </p>
          ) : null}
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

      <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", margin: "1.5rem 0 0.75rem" }}>
        RECENT INVENTORY SESSIONS
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>User</th>
              <th>Metal</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Stickers</th>
              <th>Total grams</th>
              <th>Sticker codes</th>
            </tr>
          </thead>
          <tbody>
            {(adminSessions.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="tbl-empty">
                  No inventory sessions yet
                </td>
              </tr>
            ) : (
              (adminSessions.data ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="tbl-gold">{s.display_name?.trim() || s.username}</td>
                  <td>{s.metal[0].toUpperCase() + s.metal.slice(1)}</td>
                  <td style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                    {new Date(s.started_at).toLocaleString()}
                  </td>
                  <td style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                    {s.ended_at ? new Date(s.ended_at).toLocaleString() : <span className="badge badge-morning">Active</span>}
                  </td>
                  <td>{Number(s.sticker_count ?? 0)}</td>
                  <td>{Number(s.total_grams ?? 0).toFixed(4)}</td>
                  <td style={{ fontSize: "0.62rem", color: "var(--muted)", maxWidth: "22rem" }}>
                    {s.bag_orders.length
                      ? s.bag_orders.map((b) => b.sticker_code).join(", ")
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
