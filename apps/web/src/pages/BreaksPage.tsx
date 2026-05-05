import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type BreakRow = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  total_spots: number;
  fixed_silver_spots: number;
  sold_spots: number;
  sold_prize_spots: number;
  remaining_silver_grams: number;
  template_floor_spots?: number;
  template_prize_spots?: number;
  prize_slot_count?: number;
  template_estimated_cost?: number;
};

type TemplateRowApi = {
  row_number: number;
  spot_type: "floor" | "prize";
  metal: "gold" | "silver";
  grams: number;
  quantity: number;
  estimated_row_cost?: number;
};

type BreakDetail = BreakRow & {
  templateRows?: TemplateRowApi[];
  template_estimated_cost?: number;
};

type EditableTemplateRow = {
  spotType: "floor" | "prize";
  metal: "gold" | "silver";
  grams: string;
  quantity: string;
};

type MetalPool = {
  gold: { gramsOnHand: number; avgCostPerGram: number };
  silver: { gramsOnHand: number; avgCostPerGram: number };
};

type CardMode = "closed" | "create" | "edit";

function initialTemplateRows(): EditableTemplateRow[] {
  return [
    { spotType: "floor", metal: "silver", grams: "1", quantity: "1" },
    { spotType: "prize", metal: "silver", grams: "1", quantity: "1" }
  ];
}

function rowCostUsd(row: EditableTemplateRow, pool: MetalPool | undefined): number {
  if (!pool) return 0;
  const grams = Number(row.grams);
  const qty = Number(row.quantity);
  if (!(grams > 0) || !(qty > 0) || !Number.isFinite(grams) || !Number.isFinite(qty)) return 0;
  const avg = row.metal === "gold" ? pool.gold.avgCostPerGram : pool.silver.avgCostPerGram;
  return grams * qty * avg;
}

export function BreaksPage() {
  const qc = useQueryClient();
  const [cardMode, setCardMode] = useState<CardMode>("closed");
  const [name, setName] = useState("");
  const [formBreakId, setFormBreakId] = useState("");
  const [templateRows, setTemplateRows] = useState<EditableTemplateRow[]>(initialTemplateRows);

  const breaks = useQuery({
    queryKey: ["breaks"],
    queryFn: () => api<BreakRow[]>("/v1/breaks")
  });

  const metalPool = useQuery({
    queryKey: ["metal-pool"],
    queryFn: () => api<MetalPool>("/v1/inventory/metal-pool"),
    staleTime: 60_000
  });

  const formBreak = useQuery({
    queryKey: ["break", formBreakId],
    queryFn: () => api<BreakDetail>(`/v1/breaks/${formBreakId}`),
    enabled: cardMode === "edit" && !!formBreakId
  });

  const totalSpotQty = useMemo(
    () =>
      templateRows.reduce((sum, r) => {
        const q = Math.floor(Number(r.quantity) || 0);
        return sum + (q > 0 ? q : 0);
      }, 0),
    [templateRows]
  );

  const templateCostPreview = useMemo(
    () => templateRows.reduce((sum, r) => sum + rowCostUsd(r, metalPool.data), 0),
    [templateRows, metalPool.data]
  );

  const resetForm = useCallback(() => {
    setName("");
    setTemplateRows(initialTemplateRows());
    setFormBreakId("");
  }, []);

  const openCreate = () => {
    resetForm();
    setCardMode("create");
  };

  const openEdit = (id: string) => {
    resetForm();
    setFormBreakId(id);
    setCardMode("edit");
  };

  const closeCard = () => {
    setCardMode("closed");
    resetForm();
  };

  useEffect(() => {
    if (cardMode !== "edit" || !formBreak.data) return;
    setName(formBreak.data.name);
    const raw = formBreak.data.templateRows ?? [];
    if (raw.length > 0) {
      setTemplateRows(
        [...raw]
          .sort((a, b) => a.row_number - b.row_number)
          .map((r) => ({
            spotType: r.spot_type,
            metal: r.metal,
            grams: String(r.grams),
            quantity: String(r.quantity)
          }))
      );
    }
  }, [cardMode, formBreak.data]);

  const payload = useMemo(
    () => ({
      name: name.trim(),
      templateRows: templateRows.map((r) => ({
        spotType: r.spotType,
        metal: r.metal,
        grams: Number(r.grams),
        quantity: Number(r.quantity)
      }))
    }),
    [name, templateRows]
  );

  const createBreak = useMutation({
    mutationFn: () =>
      api("/v1/breaks", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      closeCard();
      void qc.invalidateQueries({ queryKey: ["breaks"] });
    }
  });

  const updateBreak = useMutation({
    mutationFn: () =>
      api(`/v1/breaks/${formBreakId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      const id = formBreakId;
      void qc.invalidateQueries({ queryKey: ["breaks"] });
      if (id) void qc.invalidateQueries({ queryKey: ["break", id] });
      closeCard();
    }
  });

  const deleteBreak = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/breaks/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ["breaks"] });
      void qc.removeQueries({ queryKey: ["break", id] });
      if (formBreakId === id) closeCard();
    }
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!payload.name) return;
    if (totalSpotQty < 2) return;
    const invalid = payload.templateRows.some((row) => !(row.grams > 0) || !(row.quantity >= 1));
    if (invalid) return;
    if (cardMode === "edit") updateBreak.mutate();
    else createBreak.mutate();
  };

  const addRow = () => {
    setTemplateRows((prev) => [
      ...prev,
      { spotType: "prize", metal: "silver", grams: "1", quantity: "1" }
    ]);
  };

  const removeLastRow = () => {
    setTemplateRows((prev) => (prev.length <= 1 ? prev : prev.slice(0, -1)));
  };

  const cardTitle = cardMode === "edit" ? "Edit break" : cardMode === "create" ? "New break" : "";
  const formDisabled =
    (cardMode === "edit" && (formBreak.isLoading || !formBreak.data)) ||
    createBreak.isPending ||
    updateBreak.isPending;

  const savedTemplateCost =
    cardMode === "edit" && formBreak.data?.template_estimated_cost != null
      ? formBreak.data.template_estimated_cost
      : null;

  return (
    <section className="card">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ marginBottom: "0.25rem" }}>Break Management</h2>
          <p className="pg-sub" style={{ margin: 0 }}>
            Templates: each row is spot type (floor/prize), grams, metal, and quantity. Cost uses pooled average cost
            per gram by metal.
          </p>
        </div>
        <button type="button" className="btn btn-gold" onClick={openCreate} disabled={cardMode !== "closed"}>
          Add new break
        </button>
      </div>

      {breaks.error ? <p className="error">{(breaks.error as Error).message}</p> : null}

      <div className="tbl-wrap" style={{ marginBottom: "1.25rem" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Total spots</th>
              <th>Floor</th>
              <th>Prizes</th>
              <th>Est. cost</th>
              <th>Sold</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {breaks.isLoading ? (
              <tr>
                <td colSpan={8} style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : (breaks.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  No breaks yet. Use Add new break.
                </td>
              </tr>
            ) : (
              (breaks.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.status}</td>
                  <td>{row.total_spots ?? "—"}</td>
                  <td>{row.template_floor_spots ?? row.fixed_silver_spots ?? "—"}</td>
                  <td>{row.template_prize_spots ?? row.prize_slot_count ?? "—"}</td>
                  <td className="tbl-green">
                    {row.template_estimated_cost != null ? `$${row.template_estimated_cost.toFixed(2)}` : "—"}
                  </td>
                  <td style={{ fontSize: "0.75rem" }}>
                    {row.sold_spots} spots · {row.sold_prize_spots} prizes
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={cardMode !== "closed"}
                        onClick={() => openEdit(row.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={cardMode !== "closed" || deleteBreak.isPending}
                        onClick={() => {
                          if (!window.confirm(`Delete break “${row.name}”? This cannot be undone.`)) return;
                          deleteBreak.mutate(row.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deleteBreak.error ? <p className="error">{(deleteBreak.error as Error).message}</p> : null}

      {cardMode !== "closed" ? (
        <section
          className="card"
          style={{
            marginTop: "0.5rem",
            border: "1px solid var(--border, rgba(255,255,255,0.12))",
            background: "var(--surface-2, rgba(0,0,0,0.2))"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>{cardTitle}</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={closeCard} disabled={createBreak.isPending || updateBreak.isPending}>
              Close
            </button>
          </div>

          {cardMode === "edit" && formBreak.isError ? (
            <p className="error">{(formBreak.error as Error).message}</p>
          ) : cardMode === "edit" && formBreak.isLoading ? (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Loading break…</p>
          ) : (
            <form onSubmit={onSubmit}>
              <div className="form-group">
                <label className="form-label">Break name</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required disabled={formDisabled} />
              </div>

              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
                Total spots (sum of quantities): <strong>{totalSpotQty}</strong>
                {totalSpotQty < 2 ? " · need at least 2 total spots" : ""}
                {" · "}
                Template cost (estimate):{" "}
                <strong>
                  {savedTemplateCost != null
                    ? `$${savedTemplateCost.toFixed(2)}`
                    : `$${templateCostPreview.toFixed(2)}`}
                </strong>
              </p>

              <div style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.7rem", color: "var(--muted)" }}>
                Rows (first column: spot type)
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Spot type</th>
                      <th>Grams</th>
                      <th>Metal</th>
                      <th>Qty</th>
                      <th>Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateRows.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <select
                            className="form-input"
                            value={row.spotType}
                            onChange={(e) =>
                              setTemplateRows((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, spotType: e.target.value as EditableTemplateRow["spotType"] } : x
                                )
                              )
                            }
                            disabled={formDisabled}
                          >
                            <option value="floor">Floor</option>
                            <option value="prize">Prize</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            step="0.0001"
                            value={row.grams}
                            onChange={(e) =>
                              setTemplateRows((prev) => prev.map((x, i) => (i === idx ? { ...x, grams: e.target.value } : x)))
                            }
                            disabled={formDisabled}
                          />
                        </td>
                        <td>
                          <select
                            className="form-input"
                            value={row.metal}
                            onChange={(e) =>
                              setTemplateRows((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, metal: e.target.value as "gold" | "silver" } : x
                                )
                              )
                            }
                            disabled={formDisabled}
                          >
                            <option value="gold">Gold</option>
                            <option value="silver">Silver</option>
                          </select>
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            min={1}
                            max={200}
                            value={row.quantity}
                            onChange={(e) =>
                              setTemplateRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x))
                              )
                            }
                            disabled={formDisabled}
                          />
                        </td>
                        <td className="tbl-green" style={{ fontSize: "0.8rem" }}>
                          ${rowCostUsd(row, metalPool.data).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem" }}>
                <button type="button" className="btn btn-outline" onClick={addRow} disabled={formDisabled}>
                  Add row
                </button>
                <button type="button" className="btn btn-outline" onClick={removeLastRow} disabled={formDisabled || templateRows.length <= 1}>
                  Remove last row
                </button>
              </div>

              {metalPool.isError ? (
                <p className="error" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
                  {(metalPool.error as Error).message}
                </p>
              ) : null}

              {createBreak.error ? <p className="error">{(createBreak.error as Error).message}</p> : null}
              {updateBreak.error ? <p className="error">{(updateBreak.error as Error).message}</p> : null}

              <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem" }}>
                <button type="submit" className="btn btn-gold" disabled={formDisabled}>
                  {cardMode === "edit" ? "Save break" : "Create break"}
                </button>
                <button type="button" className="btn btn-outline" onClick={closeCard} disabled={createBreak.isPending || updateBreak.isPending}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}
    </section>
  );
}
