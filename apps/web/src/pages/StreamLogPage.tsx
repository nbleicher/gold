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

type StreamExpenseRow = { id: string; name: string; price: number };

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
  stream_expenses?: StreamExpenseRow[];
  stream_expenses_total?: number;
  net_profit: number | null;
  user_email: string | null;
  user_display_name: string | null;
  gold_batch_name: string;
  silver_batch_name: string;
  items: StreamItem[];
};

type ExpenseDraftRow = { localKey: string; name: string; price: string };

type StreamLogResponse = { streams: StreamLogStream[] };

function hostLabel(s: StreamLogStream) {
  return s.user_display_name?.trim() || s.user_email || "—";
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
  const [sessionEditId, setSessionEditId] = useState<string | null>(null);
  const [sessionStartedDraft, setSessionStartedDraft] = useState("");
  const [sessionEndedDraft, setSessionEndedDraft] = useState("");
  const [sessionClearEnd, setSessionClearEnd] = useState(false);
  const [expenseModalStreamId, setExpenseModalStreamId] = useState<string | null>(null);
  const [expenseRows, setExpenseRows] = useState<ExpenseDraftRow[]>([]);

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

  const patchSessionMutation = useMutation({
    mutationFn: ({
      streamId,
      body
    }: {
      streamId: string;
      body: { startedAt?: string; endedAt?: string | null };
    }) =>
      api<{ ok: boolean }>(`/v1/admin/streams/${streamId}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      }),
    onSuccess: () => {
      setSessionEditId(null);
      setSessionStartedDraft("");
      setSessionEndedDraft("");
      setSessionClearEnd(false);
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
      void qc.invalidateQueries({ queryKey: ["streams"] });
    }
  });

  const saveStreamExpensesMutation = useMutation({
    mutationFn: ({
      streamId,
      items
    }: {
      streamId: string;
      items: { name: string; price: number }[];
    }) =>
      api<{ ok: boolean }>(`/v1/admin/streams/${streamId}/expenses`, {
        method: "PUT",
        body: JSON.stringify({ items })
      }),
    onSuccess: () => {
      setExpenseModalStreamId(null);
      setExpenseRows([]);
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
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

  const openSessionEdit = (st: StreamLogStream) => {
    setExpanded((prev) => new Set(prev).add(st.id));
    setSessionEditId(st.id);
    setSessionStartedDraft(toDatetimeLocalValue(st.started_at));
    setSessionEndedDraft(st.ended_at ? toDatetimeLocalValue(st.ended_at) : "");
    setSessionClearEnd(false);
  };

  const openExpenseModal = (st: StreamLogStream) => {
    setExpenseModalStreamId(st.id);
    const saved = st.stream_expenses ?? [];
    const rows: ExpenseDraftRow[] =
      saved.length > 0
        ? [
            ...saved.map((e) => ({
              localKey: `srv-${e.id}`,
              name: e.name,
              price: String(e.price)
            })),
            { localKey: `blank-${Date.now()}`, name: "", price: "" }
          ]
        : [{ localKey: "starter", name: "", price: "" }];
    setExpenseRows(rows);
  };

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
      {patchSessionMutation.error ? (
        <p className="error">{(patchSessionMutation.error as Error).message}</p>
      ) : null}
      {saveStreamExpensesMutation.error ? (
        <p className="error">{(saveStreamExpensesMutation.error as Error).message}</p>
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
              <th>Stream extras</th>
              <th>Net profit</th>
              <th>Avg spot</th>
              <th>Completed earnings</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {streams.length === 0 ? (
              <tr>
                <td colSpan={14} className="tbl-empty">
                  No streams logged yet
                </td>
              </tr>
            ) : (
              streams.flatMap((st) => {
                const { itemsTotal, metal, avgSpot, mix, rawB, count } = summarizeStream(st);
                const cogsTotal = Number(st.items_cogs_total ?? 0);
                const extrasTotal = Number(st.stream_expenses_total ?? 0);
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
                    <td style={{ fontSize: "0.62rem" }}>${extrasTotal.toFixed(2)}</td>
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
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-start" }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={saveStreamExpensesMutation.isPending}
                          onClick={() => openExpenseModal(st)}
                        >
                          Expenses
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={patchSessionMutation.isPending}
                          onClick={() => openSessionEdit(st)}
                        >
                          Edit session
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => requestDelete(st)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                if (!isOpen) return [mainRow];
                const detailRow = (
                  <tr key={`${st.id}-detail`}>
                    <td colSpan={14} style={{ background: "var(--slate)", padding: "0.75rem 1rem" }}>
                      {sessionEditId === st.id ? (
                        <div
                          style={{
                            marginBottom: "1rem",
                            padding: "0.65rem 0.75rem",
                            background: "var(--surface-2, rgba(0,0,0,0.2))",
                            borderRadius: "6px",
                            fontSize: "0.7rem"
                          }}
                        >
                          <strong style={{ display: "block", marginBottom: "0.5rem" }}>Edit session times</strong>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                              Started
                              <input
                                className="form-input"
                                type="datetime-local"
                                value={sessionStartedDraft}
                                onChange={(e) => setSessionStartedDraft(e.target.value)}
                                disabled={patchSessionMutation.isPending}
                              />
                            </label>
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                              Ended
                              <input
                                className="form-input"
                                type="datetime-local"
                                value={sessionEndedDraft}
                                onChange={(e) => setSessionEndedDraft(e.target.value)}
                                disabled={patchSessionMutation.isPending || sessionClearEnd}
                              />
                            </label>
                          </div>
                          {st.ended_at ? (
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                marginTop: "0.5rem",
                                cursor: "pointer"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={sessionClearEnd}
                                onChange={(e) => setSessionClearEnd(e.target.checked)}
                                disabled={patchSessionMutation.isPending}
                              />
                              Clear end time (mark session as still live)
                            </label>
                          ) : null}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
                            <button
                              type="button"
                              className="btn btn-gold btn-sm"
                              disabled={patchSessionMutation.isPending || !sessionStartedDraft.trim()}
                              onClick={() => {
                                if (!sessionStartedDraft.trim()) return;
                                const body: { startedAt: string; endedAt?: string | null } = {
                                  startedAt: new Date(sessionStartedDraft).toISOString()
                                };
                                if (sessionClearEnd) {
                                  body.endedAt = null;
                                } else if (sessionEndedDraft.trim()) {
                                  body.endedAt = new Date(sessionEndedDraft).toISOString();
                                }
                                patchSessionMutation.mutate({ streamId: st.id, body });
                              }}
                            >
                              Save session
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={patchSessionMutation.isPending}
                              onClick={() => {
                                setSessionEditId(null);
                                setSessionStartedDraft("");
                                setSessionEndedDraft("");
                                setSessionClearEnd(false);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
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

      {expenseModalStreamId ? (
        <div
          className="modal-overlay open"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saveStreamExpensesMutation.isPending) {
              setExpenseModalStreamId(null);
              setExpenseRows([]);
            }
          }}
        >
          <div
            className="modal"
            style={{ maxWidth: "min(32rem, 94vw)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stream-expenses-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              aria-label="Close"
              disabled={saveStreamExpensesMutation.isPending}
              onClick={() => {
                setExpenseModalStreamId(null);
                setExpenseRows([]);
              }}
            >
              ✕
            </button>
            <div id="stream-expenses-title" className="modal-title">
              Stream extras
              {(() => {
                const st = streams.find((x) => x.id === expenseModalStreamId);
                return st ? ` · ${hostLabel(st)}` : "";
              })()}
            </div>
            <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
              Name and price per line. Saved extras reduce net profit for this session and roll into global net profit.
            </p>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Price</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((row) => (
                    <tr key={row.localKey}>
                      <td>
                        <input
                          className="form-input"
                          value={row.name}
                          onChange={(e) =>
                            setExpenseRows((prev) =>
                              prev.map((r) =>
                                r.localKey === row.localKey ? { ...r, name: e.target.value } : r
                              )
                            )
                          }
                          placeholder="e.g. Props"
                          disabled={saveStreamExpensesMutation.isPending}
                        />
                      </td>
                      <td>
                        <input
                          className="form-input"
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.price}
                          onChange={(e) =>
                            setExpenseRows((prev) =>
                              prev.map((r) =>
                                r.localKey === row.localKey ? { ...r, price: e.target.value } : r
                              )
                            )
                          }
                          disabled={saveStreamExpensesMutation.isPending}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={saveStreamExpensesMutation.isPending}
                          onClick={() =>
                            setExpenseRows((prev) => {
                              const next = prev.filter((r) => r.localKey !== row.localKey);
                              return next.length === 0
                                ? [{ localKey: `empty-${Date.now()}`, name: "", price: "" }]
                                : next;
                            })
                          }
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ marginTop: "0.65rem" }}
              disabled={saveStreamExpensesMutation.isPending}
              onClick={() =>
                setExpenseRows((prev) => [
                  ...prev,
                  { localKey: `new-${Date.now()}`, name: "", price: "" }
                ])
              }
            >
              + Add expense
            </button>
            <div className="modal-actions" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={saveStreamExpensesMutation.isPending}
                onClick={() => {
                  setExpenseModalStreamId(null);
                  setExpenseRows([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-gold"
                disabled={saveStreamExpensesMutation.isPending || !expenseModalStreamId}
                onClick={() => {
                  if (!expenseModalStreamId) return;
                  const items = expenseRows
                    .map((r) => ({
                      name: r.name.trim(),
                      price: Number(r.price)
                    }))
                    .filter((r) => r.name.length > 0 && Number.isFinite(r.price) && r.price >= 0);
                  saveStreamExpensesMutation.mutate({
                    streamId: expenseModalStreamId,
                    items
                  });
                }}
              >
                Save extras
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
