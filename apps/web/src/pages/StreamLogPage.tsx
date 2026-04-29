import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type StreamItem = {
  id: string;
  sale_type: string;
  name: string;
  metal: string;
  weight_grams: number;
  spot_value: number;
  spot_price: number;
  sticker_code: string | null;
  batch_id: string | null;
  break_id: string | null;
  break_spot_id: string | null;
  batch_name: string | null;
  cogs: number;
};

type StreamLogStream = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  gold_batch_id: string | null;
  silver_batch_id: string | null;
  completed_earnings: number | null;
  items_spot_total: number;
  items_cogs_total: number;
  items_break_floor_silver_grams?: number;
  net_profit: number | null;
  user_email: string | null;
  user_display_name: string | null;
  gold_batch_name: string;
  silver_batch_name: string;
  items: StreamItem[];
};

type StreamLogResponse = { streams: StreamLogStream[] };

function hostLabel(s: StreamLogStream) {
  return s.user_display_name?.trim() || s.user_email || "—";
}

function summarizeStream(st: StreamLogStream) {
  const its = st.items ?? [];
  const itemsTotal = its.reduce((sum, i) => sum + Number(i.spot_value), 0);
  const metals = [...new Set(its.map((i) => i.metal || "gold"))];
  const metal = metals.length > 1 ? "mixed" : metals[0] || "gold";
  const avgSpot = its.length ? its.reduce((sum, i) => sum + Number(i.spot_price), 0) / its.length : 0;
  const breakN = its.filter((i) => Boolean(i.break_id)).length;
  const stN = its.filter((i) => i.sale_type === "sticker").length;
  const rawOther = its.filter((i) => i.sale_type === "raw" && !i.break_id).length;
  const leg = its.length - breakN - stN - rawOther;
  const floorG = Number(st.items_break_floor_silver_grams ?? 0);
  const silverNote = floorG > 0 ? ` · floor Ag ${floorG.toFixed(2)}g` : "";
  const mix =
    leg > 0
      ? `${breakN} break${silverNote} · ${stN} legacy sticker · ${rawOther} raw · ${leg} other`
      : `${breakN} break${silverNote} · ${stN} legacy sticker · ${rawOther} raw`;
  const rawB = `G: ${st.gold_batch_name} · S: ${st.silver_batch_name}`;
  return { itemsTotal, metal, avgSpot, mix, rawB, count: its.length };
}

export function StreamLogPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [earningsEditingId, setEarningsEditingId] = useState<string | null>(null);
  const [earningsDraft, setEarningsDraft] = useState("");

  const toggleExpanded = (streamId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(streamId)) next.delete(streamId);
      else next.add(streamId);
      return next;
    });
  };

  const q = useQuery({
    queryKey: ["admin-stream-log"],
    queryFn: () => api<StreamLogResponse>("/v1/admin/stream-log")
  });

  const deleteMutation = useMutation({
    mutationFn: (streamId: string) =>
      api<{ ok: boolean }>(`/v1/admin/streams/${streamId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api<{ ok: boolean }>(`/v1/streams/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
      void qc.invalidateQueries({ queryKey: ["streams"] });
      void qc.invalidateQueries({ queryKey: ["batches"] });
      void qc.invalidateQueries({ queryKey: ["bag-orders"] });
    }
  });

  const completedEarningsMutation = useMutation({
    mutationFn: ({ streamId, completedEarnings }: { streamId: string; completedEarnings: number }) =>
      api<{ ok: boolean }>(`/v1/admin/streams/${streamId}/completed-earnings`, {
        method: "PATCH",
        body: JSON.stringify({ completedEarnings })
      }),
    onSuccess: () => {
      setEarningsEditingId(null);
      setEarningsDraft("");
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
    }
  });

  const requestDelete = (st: StreamLogStream) => {
    const ok = window.confirm(
      "Delete this stream session and all logged line items? Raw metal returns to batches; legacy sticker sales clear sold flags on matching bags."
    );
    if (!ok) return;
    deleteMutation.mutate(st.id);
  };

  const streams = q.data?.streams ?? [];
  const totalItems = streams.reduce((s, st) => s + (st.items?.length ?? 0), 0);
  const totalVal = streams.reduce(
    (s, st) => s + (st.items ?? []).reduce((ss, it) => ss + Number(it.spot_value), 0),
    0
  );

  return (
    <section className="card">
      <h2>Stream Log</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        All streaming sessions
      </p>

      {q.error ? <p className="error">{(q.error as Error).message}</p> : null}
      {deleteMutation.error ? (
        <p className="error">{(deleteMutation.error as Error).message}</p>
      ) : null}
      {deleteItemMutation.error ? (
        <p className="error">{(deleteItemMutation.error as Error).message}</p>
      ) : null}
      {completedEarningsMutation.error ? (
        <p className="error">{(completedEarningsMutation.error as Error).message}</p>
      ) : null}

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.5rem" }}>
        <div className="stat-box">
          <div className="stat-lbl">Total streams</div>
          <div className="stat-val">{streams.length}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Total items sold</div>
          <div className="stat-val">{totalItems}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Total spot value (est.)</div>
          <div className="stat-val">${totalVal.toFixed(0)}</div>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th aria-label="Expand" />
              <th>Date</th>
              <th>Host</th>
              <th>Metal</th>
              <th>Sales mix</th>
              <th>Raw batches</th>
              <th>Items sold</th>
              <th>Spot value (est.)</th>
              <th>COGS</th>
              <th>Net profit</th>
              <th>Avg spot</th>
              <th>Completed earnings</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {streams.length === 0 ? (
              <tr>
                <td colSpan={13} className="tbl-empty">
                  No streams logged yet
                </td>
              </tr>
            ) : (
              streams.flatMap((st) => {
                const { itemsTotal, metal, avgSpot, mix, rawB, count } = summarizeStream(st);
                const cogsTotal = Number(st.items_cogs_total ?? 0);
                const netStr =
                  st.net_profit != null && Number.isFinite(st.net_profit)
                    ? `$${Number(st.net_profit).toFixed(2)}`
                    : "—";
                const isOpen = expanded.has(st.id);
                const items = st.items ?? [];
                const mainRow = (
                  <tr key={st.id}>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        aria-expanded={isOpen}
                        onClick={() => toggleExpanded(st.id)}
                        style={{ padding: "0.15rem 0.45rem", minWidth: "2rem" }}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                    <td>
                      {new Date(st.started_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </td>
                    <td className="tbl-gold">{hostLabel(st)}</td>
                    <td>
                      <span className="badge badge-morning">{metal}</span>
                    </td>
                    <td style={{ fontSize: "0.62rem" }}>{mix}</td>
                    <td style={{ fontSize: "0.58rem", color: "var(--muted)" }}>{rawB}</td>
                    <td>{count}</td>
                    <td className="tbl-green">${itemsTotal.toFixed(2)}</td>
                    <td>${cogsTotal.toFixed(2)}</td>
                    <td style={{ fontSize: "0.62rem" }}>{netStr}</td>
                    <td>${Number(avgSpot || 0).toFixed(2)}/oz</td>
                    <td style={{ fontSize: "0.62rem", verticalAlign: "top" }}>
                      {earningsEditingId === st.id ? (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.35rem",
                            minWidth: "7.5rem"
                          }}
                        >
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={earningsDraft}
                            onChange={(e) => setEarningsDraft(e.target.value)}
                            disabled={completedEarningsMutation.isPending}
                            style={{ maxWidth: "9rem" }}
                          />
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="btn btn-gold btn-sm"
                              disabled={completedEarningsMutation.isPending}
                              onClick={() => {
                                const n = Number(earningsDraft);
                                if (!Number.isFinite(n) || n < 0) return;
                                completedEarningsMutation.mutate({
                                  streamId: st.id,
                                  completedEarnings: n
                                });
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={completedEarningsMutation.isPending}
                              onClick={() => {
                                setEarningsEditingId(null);
                                setEarningsDraft("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : st.completed_earnings != null ? (
                        <div>
                          <div>
                            Completed earnings: ${Number(st.completed_earnings).toFixed(2)}
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ marginTop: "0.35rem" }}
                            onClick={() => {
                              setEarningsEditingId(st.id);
                              setEarningsDraft(String(st.completed_earnings));
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setEarningsEditingId(st.id);
                            setEarningsDraft("");
                          }}
                        >
                          Add Completed Earnings
                        </button>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => requestDelete(st)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
                if (!isOpen) return [mainRow];
                const detailRow = (
                  <tr key={`${st.id}-detail`}>
                    <td colSpan={13} style={{ background: "var(--slate)", padding: "0.75rem 1rem" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                        Session line items — remove to reverse inventory (grams return to batches)
                      </div>
                      {items.length === 0 ? (
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>No items</span>
                      ) : (
                        <div className="tbl-wrap">
                          <table className="tbl">
                            <thead>
                              <tr>
                                <th>Type</th>
                                <th>Spot #</th>
                                <th>Metal</th>
                                <th>Weight (g)</th>
                                <th>Spot value</th>
                                <th>COGS</th>
                                <th aria-label="Remove" />
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it) => (
                                <tr key={it.id}>
                                  <td>{it.sale_type}</td>
                                  <td>{it.name}</td>
                                  <td>{it.metal}</td>
                                  <td>{Number(it.weight_grams).toFixed(4)}</td>
                                  <td className="tbl-green">${Number(it.spot_value).toFixed(2)}</td>
                                  <td>${Number(it.cogs ?? 0).toFixed(2)}</td>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      disabled={deleteItemMutation.isPending}
                                      onClick={() => {
                                        if (!window.confirm("Remove this line item and reverse inventory?"))
                                          return;
                                        deleteItemMutation.mutate(it.id);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                );
                return [mainRow, detailRow];
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
