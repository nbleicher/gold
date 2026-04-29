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
  prize_slot_count?: number;
};

type PrizeSlot = {
  id?: string;
  slot_number: number;
  slot_type: "normal" | "mega" | "prize";
  metal: "gold" | "silver";
  grams: number;
  cost: number;
  is_consumed?: number;
};

type BreakDetail = BreakRow & {
  prizeSlots: PrizeSlot[];
};

type EditableSlot = {
  slotNumber: number;
  slotType: "normal" | "mega" | "prize";
  metal: "gold" | "silver";
  grams: string;
  cost: string;
};

type CardMode = "closed" | "create" | "edit";

function initialSlots(): EditableSlot[] {
  return [{ slotNumber: 1, slotType: "prize", metal: "silver", grams: "1", cost: "0" }];
}

function renumberSlots(slots: EditableSlot[]): EditableSlot[] {
  return slots.map((row, i) => ({ ...row, slotNumber: i + 1 }));
}

export function BreaksPage() {
  const qc = useQueryClient();
  const [cardMode, setCardMode] = useState<CardMode>("closed");
  const [name, setName] = useState("");
  const [floorSilverSpots, setFloorSilverSpots] = useState(1);
  const [formBreakId, setFormBreakId] = useState("");
  const [slots, setSlots] = useState<EditableSlot[]>(initialSlots);

  const breaks = useQuery({
    queryKey: ["breaks"],
    queryFn: () => api<BreakRow[]>("/v1/breaks")
  });

  const formBreak = useQuery({
    queryKey: ["break", formBreakId],
    queryFn: () => api<BreakDetail>(`/v1/breaks/${formBreakId}`),
    enabled: cardMode === "edit" && !!formBreakId
  });

  const totalSpots = floorSilverSpots + slots.length;

  const resetForm = useCallback(() => {
    setName("");
    setFloorSilverSpots(1);
    setSlots(initialSlots());
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
    setFloorSilverSpots(Number(formBreak.data.fixed_silver_spots));
    const fromApi: EditableSlot[] = (formBreak.data.prizeSlots ?? []).map((slot) => ({
      slotNumber: Number(slot.slot_number),
      slotType: slot.slot_type,
      metal: slot.metal,
      grams: String(slot.grams),
      cost: String(slot.cost)
    }));
    if (fromApi.length > 0) {
      setSlots(renumberSlots(fromApi.sort((a, b) => a.slotNumber - b.slotNumber)));
    }
  }, [cardMode, formBreak.data]);

  const payload = useMemo(
    () => ({
      name: name.trim(),
      totalSpots,
      floorSilverSpots,
      prizeSlots: slots.map((slot) => ({
        slotNumber: slot.slotNumber,
        slotType: slot.slotType,
        metal: slot.metal,
        grams: Number(slot.grams),
        cost: Number(slot.cost)
      }))
    }),
    [name, totalSpots, floorSilverSpots, slots]
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
    if (totalSpots < 2) return;
    const invalid = payload.prizeSlots.some((slot) => !(slot.grams > 0) || !(slot.cost >= 0));
    if (invalid) return;
    if (cardMode === "edit") updateBreak.mutate();
    else createBreak.mutate();
  };

  const addPrizeSlot = () => {
    setSlots((prev) =>
      renumberSlots([
        ...prev,
        {
          slotNumber: prev.length + 1,
          slotType: "prize",
          metal: "silver",
          grams: "1",
          cost: "0"
        }
      ])
    );
  };

  const removeLastSlot = () => {
    setSlots((prev) => (prev.length <= 1 ? prev : renumberSlots(prev.slice(0, -1))));
  };

  const cardTitle = cardMode === "edit" ? "Edit break" : cardMode === "create" ? "New break" : "";
  const formDisabled =
    (cardMode === "edit" && (formBreak.isLoading || !formBreak.data)) ||
    createBreak.isPending ||
    updateBreak.isPending;

  return (
    <section className="card">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ marginBottom: "0.25rem" }}>Break Management</h2>
          <p className="pg-sub" style={{ margin: 0 }}>
            Templates: floor spots + prizes. Each stream run clones a template; floor count per run is set on Streams.
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
              <th>Total</th>
              <th>Floor</th>
              <th>Prizes</th>
              <th>Sold</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {breaks.isLoading ? (
              <tr>
                <td colSpan={7} style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : (breaks.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  No breaks yet. Use Add new break.
                </td>
              </tr>
            ) : (
              (breaks.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.status}</td>
                  <td>{row.total_spots ?? "—"}</td>
                  <td>{row.fixed_silver_spots ?? "—"}</td>
                  <td>{row.prize_slot_count ?? "—"}</td>
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

              <div className="form-group">
                <label className="form-label">Floor silver spots (1g each)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={200}
                  value={floorSilverSpots}
                  onChange={(e) => setFloorSilverSpots(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                  disabled={formDisabled}
                />
              </div>

              <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
                Total spots (computed): <strong>{totalSpots}</strong> = {floorSilverSpots} floor + {slots.length} prize
                {totalSpots < 2 ? " · need at least 2 total spots" : ""}
              </p>

              <div style={{ marginTop: "1rem", marginBottom: "0.5rem", fontSize: "0.7rem", color: "var(--muted)" }}>
                Prize configuration (type defaults to prize)
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Type</th>
                      <th>Metal</th>
                      <th>Grams</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot, idx) => (
                      <tr key={idx}>
                        <td>{slot.slotNumber}</td>
                        <td>
                          <select
                            className="form-input"
                            value={slot.slotType}
                            onChange={(e) =>
                              setSlots((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, slotType: e.target.value as EditableSlot["slotType"] } : row
                                )
                              )
                            }
                            disabled={formDisabled}
                          >
                            <option value="prize">prize</option>
                            <option value="normal">normal</option>
                            <option value="mega">mega</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-input"
                            value={slot.metal}
                            onChange={(e) =>
                              setSlots((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, metal: e.target.value as "gold" | "silver" } : row
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
                            min={0}
                            step="0.0001"
                            value={slot.grams}
                            onChange={(e) =>
                              setSlots((prev) => prev.map((row, i) => (i === idx ? { ...row, grams: e.target.value } : row)))
                            }
                            disabled={formDisabled}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            step="0.01"
                            value={slot.cost}
                            onChange={(e) =>
                              setSlots((prev) => prev.map((row, i) => (i === idx ? { ...row, cost: e.target.value } : row)))
                            }
                            disabled={formDisabled}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem" }}>
                <button type="button" className="btn btn-outline" onClick={addPrizeSlot} disabled={formDisabled}>
                  Add prize slot
                </button>
                <button type="button" className="btn btn-outline" onClick={removeLastSlot} disabled={formDisabled || slots.length <= 1}>
                  Remove last prize slot
                </button>
              </div>

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
