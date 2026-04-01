import { FormEvent, useMemo, useState } from "react";
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
  batch_number: number | null;
  batch_name: string | null;
  sticker_batch_letter: string;
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function InventoryMgmtPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(todayYmd);
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [grams, setGrams] = useState("");
  const [spot, setSpot] = useState("");
  const [cost, setCost] = useState("");

  const batches = useQuery({
    queryKey: ["batches"],
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
      qc.invalidateQueries({ queryKey: ["batches"] });
      setModalOpen(false);
      setGrams("");
      setSpot("");
      setCost("");
      setDate(todayYmd());
    }
  });

  const patchCode = useMutation({
    mutationFn: ({ id, letter }: { id: string; letter: string }) =>
      api<Batch>(`/v1/inventory/batches/${id}/code`, {
        method: "PATCH",
        body: JSON.stringify({ stickerBatchLetter: letter })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] })
  });

  const deleteBatch = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/inventory/batches/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] })
  });

  const items = batches.data ?? [];
  const stats = useMemo(() => {
    const totalGrams = items.reduce((s, b) => s + Number(b.grams), 0);
    const totalRem = items.reduce((s, b) => s + Number(b.remaining_grams), 0);
    const totalCost = items.reduce((s, b) => s + Number(b.total_cost), 0);
    return { totalGrams, totalRem, totalCost, count: items.length };
  }, [items]);

  const byDate = useMemo(() => {
    const m = new Map<string, Batch[]>();
    for (const b of items) {
      const list = m.get(b.date) ?? [];
      list.push(b);
      m.set(b.date, list);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const onSubmitModal = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !grams || !Number.isFinite(Number(grams))) return;
    createBatch.mutate();
  };

  const openModal = () => {
    setDate(todayYmd());
    setModalOpen(true);
  };

  return (
    <section className="card">
      <h2>Orders</h2>
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
        Metal batches · remaining weight after bagging &amp; stream sales
      </p>

      {batches.error ? <p className="error">{(batches.error as Error).message}</p> : null}

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-box">
          <div className="stat-lbl">Total batches</div>
          <div className="stat-val">{stats.count}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Purchased (g)</div>
          <div className="stat-val">
            {stats.totalGrams.toFixed(2)}
            <span className="stat-unit">g</span>
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Remaining (g)</div>
          <div className="stat-val">
            {stats.totalRem.toFixed(2)}
            <span className="stat-unit">g</span>
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Total cost</div>
          <div className="stat-val">
            ${stats.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button type="button" className="btn btn-gold" onClick={openModal}>
          + Add batch
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)", fontSize: "0.7rem" }}>
          No batches yet
        </div>
      ) : (
        byDate.map(([dateKey, group]) => {
          const groupCost = group.reduce((s, b) => s + Number(b.total_cost), 0);
          const dtLabel = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "short",
            month: "long",
            day: "numeric",
            year: "numeric"
          });
          return (
            <div key={dateKey} className="date-group" style={{ marginBottom: "1.5rem" }}>
              <div className="date-group-header">
                <span className="date-group-label">{dtLabel}</span>
                <div className="date-line" />
                <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>${groupCost.toFixed(2)} total</span>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Code</th>
                      <th>Metal</th>
                      <th>Purchased (g)</th>
                      <th>Remaining (g)</th>
                      <th>Spot @ buy</th>
                      <th>Total cost</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((b) => (
                      <tr key={b.id}>
                        <td className="tbl-gold">{b.batch_name ?? "—"}</td>
                        <td>
                          <input
                            className="form-input"
                            style={{
                              maxWidth: "3.2rem",
                              padding: "0.35rem 0.5rem",
                              textAlign: "center",
                              textTransform: "uppercase"
                            }}
                            maxLength={1}
                            defaultValue={b.sticker_batch_letter}
                            key={`${b.id}-${b.sticker_batch_letter}`}
                            onBlur={(e) => {
                              const L = e.target.value.trim().toUpperCase().slice(0, 1);
                              if (!L || L === b.sticker_batch_letter) return;
                              patchCode.mutate(
                                { id: b.id, letter: L },
                                {
                                  onError: (err) => {
                                    e.target.value = b.sticker_batch_letter;
                                    alert(err instanceof Error ? err.message : "Invalid code");
                                  }
                                }
                              );
                            }}
                          />
                        </td>
                        <td>{b.metal[0].toUpperCase() + b.metal.slice(1)}</td>
                        <td>{Number(b.grams).toFixed(4)}</td>
                        <td className="tbl-green">{Number(b.remaining_grams).toFixed(4)}</td>
                        <td>${Number(b.purchase_spot).toFixed(2)}</td>
                        <td className="tbl-green">${Number(b.total_cost).toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (!confirm("Remove this batch?")) return;
                              deleteBatch.mutate(b.id, {
                                onError: (err) => alert(err instanceof Error ? err.message : "Delete failed")
                              });
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      <div
        className={`modal-overlay${modalOpen ? " open" : ""}`}
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
      >
        <div className="modal">
          <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
            ✕
          </button>
          <div className="modal-title">Add batch — Orders</div>
          <form onSubmit={onSubmitModal}>
            <div className="form-group">
              <label className="form-label" htmlFor="bm-date">
                Date
              </label>
              <input
                id="bm-date"
                className="form-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="bm-metal">
                Metal
              </label>
              <select
                id="bm-metal"
                className="form-input"
                value={metal}
                onChange={(e) => setMetal(e.target.value as "gold" | "silver")}
              >
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="bm-grams">
                Amount (grams)
              </label>
              <input
                id="bm-grams"
                className="form-input"
                type="number"
                min={0}
                step="0.0001"
                placeholder="0.0000"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="bm-spot">
                Spot at purchase ($/oz)
              </label>
              <input
                id="bm-spot"
                className="form-input"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={spot}
                onChange={(e) => setSpot(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="bm-cost">
                Total cost ($)
              </label>
              <input
                id="bm-cost"
                className="form-input"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                required
              />
            </div>
            {createBatch.error ? <p className="error">{(createBatch.error as Error).message}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold" disabled={createBatch.isPending}>
                Save batch
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
