import { FormEvent, useEffect, useMemo, useState } from "react";
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

function initialSlots(): EditableSlot[] {
  return [{ slotNumber: 1, slotType: "prize", metal: "silver", grams: "1", cost: "0" }];
}

function renumberSlots(slots: EditableSlot[]): EditableSlot[] {
  return slots.map((row, i) => ({ ...row, slotNumber: i + 1 }));
}

export function BreaksPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [floorSilverSpots, setFloorSilverSpots] = useState(1);
  const [selectedBreakId, setSelectedBreakId] = useState<string>("");
  const [slots, setSlots] = useState<EditableSlot[]>(initialSlots);

  const breaks = useQuery({
    queryKey: ["breaks"],
    queryFn: () => api<BreakRow[]>("/v1/breaks")
  });

  const selectedBreak = useQuery({
    queryKey: ["break", selectedBreakId],
    queryFn: () => api<BreakDetail>(`/v1/breaks/${selectedBreakId}`),
    enabled: !!selectedBreakId
  });

  const totalSpots = floorSilverSpots + slots.length;

  useEffect(() => {
    if (!selectedBreak.data) return;
    setName(selectedBreak.data.name);
    setFloorSilverSpots(Number(selectedBreak.data.fixed_silver_spots));
    const fromApi: EditableSlot[] = (selectedBreak.data.prizeSlots ?? []).map((slot) => ({
      slotNumber: Number(slot.slot_number),
      slotType: slot.slot_type,
      metal: slot.metal,
      grams: String(slot.grams),
      cost: String(slot.cost)
    }));
    if (fromApi.length > 0) {
      setSlots(renumberSlots(fromApi.sort((a, b) => a.slotNumber - b.slotNumber)));
    }
  }, [selectedBreak.data]);

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
      setName("");
      setFloorSilverSpots(1);
      setSlots(initialSlots());
      setSelectedBreakId("");
      void qc.invalidateQueries({ queryKey: ["breaks"] });
    }
  });

  const updateBreak = useMutation({
    mutationFn: () =>
      api(`/v1/breaks/${selectedBreakId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["breaks"] });
      void qc.invalidateQueries({ queryKey: ["break", selectedBreakId] });
    }
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!payload.name) return;
    if (totalSpots < 2) return;
    const invalid = payload.prizeSlots.some((slot) => !(slot.grams > 0) || !(slot.cost >= 0));
    if (invalid) return;
    if (selectedBreakId) updateBreak.mutate();
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

  return (
    <section className="card">
      <h2>Break Management</h2>
      <p className="pg-sub" style={{ marginBottom: "1.25rem" }}>
        Define total spots, floor (silver) spots, and prize slots. Each stream run clones this template; enter floor
        spots per run on the Streams page.
      </p>

      {breaks.error ? <p className="error">{(breaks.error as Error).message}</p> : null}

      <div className="form-group" style={{ marginBottom: "1rem" }}>
        <label className="form-label">Edit existing break</label>
        <select
          className="form-input"
          value={selectedBreakId}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedBreakId(id);
            if (!id) {
              setName("");
              setFloorSilverSpots(1);
              setSlots(initialSlots());
            }
          }}
        >
          <option value="">Create new break</option>
          {(breaks.data ?? []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} · {row.total_spots ?? "?"} spots · {row.fixed_silver_spots ?? "?"} floor ·{" "}
              {row.prize_slot_count ?? "?"} prizes
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label">Break name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
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
                          prev.map((row, i) => (i === idx ? { ...row, metal: e.target.value as "gold" | "silver" } : row))
                        )
                      }
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
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.75rem" }}>
          <button type="button" className="btn btn-outline" onClick={addPrizeSlot}>
            Add prize slot
          </button>
          <button type="button" className="btn btn-outline" onClick={removeLastSlot} disabled={slots.length <= 1}>
            Remove last prize slot
          </button>
        </div>

        {createBreak.error ? <p className="error">{(createBreak.error as Error).message}</p> : null}
        {updateBreak.error ? <p className="error">{(updateBreak.error as Error).message}</p> : null}

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem" }}>
          <button type="submit" className="btn btn-gold" disabled={createBreak.isPending || updateBreak.isPending}>
            {selectedBreakId ? "Save break" : "Create break"}
          </button>
          {selectedBreakId ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setSelectedBreakId("");
                setName("");
                setFloorSilverSpots(1);
                setSlots(initialSlots());
              }}
            >
              New break
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
