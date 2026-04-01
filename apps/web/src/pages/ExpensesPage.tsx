import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type Expense = { id: string; date: string; name: string; cost: number; created_at: string };

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ExpensesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(todayYmd);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");

  const list = useQuery({
    queryKey: ["admin-expenses"],
    queryFn: () => api<Expense[]>("/v1/admin/expenses")
  });

  const create = useMutation({
    mutationFn: () =>
      api<Expense>("/v1/admin/expenses", {
        method: "POST",
        body: JSON.stringify({
          date,
          name: name.trim(),
          cost: Number(cost)
        })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-expenses"] });
      setModalOpen(false);
      setName("");
      setCost("");
      setDate(todayYmd());
    }
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/admin/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-expenses"] })
  });

  const items = list.data ?? [];
  const totalCost = items.reduce((s, i) => s + Number(i.cost), 0);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !Number.isFinite(Number(cost)) || Number(cost) < 0) return;
    create.mutate();
  };

  return (
    <section className="card">
      <h2>Expenses</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Track operating expenses by date
      </p>

      {list.error ? <p className="error">{(list.error as Error).message}</p> : null}

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="stat-box">
          <div className="stat-lbl">Total expenses</div>
          <div className="stat-val">{items.length}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Total cost</div>
          <div className="stat-val">${totalCost.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button type="button" className="btn btn-gold" onClick={() => setModalOpen(true)}>
          + Add expense
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="tbl-empty">
                  No expenses recorded
                </td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {new Date(i.date + "T12:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    })}
                  </td>
                  <td className="tbl-gold">{i.name}</td>
                  <td className="tbl-green">${Number(i.cost).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm("Remove this expense?")) remove.mutate(i.id);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        className={`modal-overlay${modalOpen ? " open" : ""}`}
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
      >
        <div className="modal">
          <button type="button" className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
            ✕
          </button>
          <div className="modal-title">Add expense</div>
          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="ex-date">
                Date
              </label>
              <input
                id="ex-date"
                className="form-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ex-name">
                Description
              </label>
              <input
                id="ex-name"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Shipping supplies"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ex-cost">
                Cost (USD)
              </label>
              <input
                id="ex-cost"
                className="form-input"
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            {create.error ? <p className="error">{(create.error as Error).message}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold" disabled={create.isPending}>
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
