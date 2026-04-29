import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Stream = {
  id: string;
  started_at: string;
  ended_at: string | null;
};

type StreamItemRow = {
  id: string;
  sale_type: string;
  name: string;
  metal: string;
  weight_grams: number;
  spot_value: number;
};

type BreakRow = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  total_spots?: number;
  fixed_silver_spots?: number;
  sold_prize_spots: number;
  prize_slot_count?: number;
};

type ActiveBreakResponse = {
  streamBreak: {
    id: string;
    break_id: string;
    break_name: string;
    sold_prize_spots: number;
    sold_spots: number;
    remaining_silver_grams: number;
    floor_spots: number;
    prize_slot_count: number;
  } | null;
  spots: Array<{
    id: string;
    spot_number: number;
    outcome_type: "silver" | "prize" | null;
    processed_at: string | null;
    prize_slot_id: string | null;
  }>;
  prizeSlots: Array<{
    id: string;
    slot_number: number;
    slot_type: "normal" | "mega" | "prize";
    metal: "gold" | "silver";
    grams: number;
    cost: number;
    is_consumed: number;
  }>;
};

type BreakStats = {
  totalBreakCost: number;
  totalFloorSilverGrams: number;
};

export function StreamsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [isStartCardOpen, setIsStartCardOpen] = useState(false);
  const [selectedBreakId, setSelectedBreakId] = useState("");
  const [floorSpotsInput, setFloorSpotsInput] = useState("40");
  const [outcomeType, setOutcomeType] = useState<"silver" | "prize">("silver");
  const [selectedPrizeSlotId, setSelectedPrizeSlotId] = useState("");

  const streams = useQuery({
    queryKey: ["streams", user?.id],
    queryFn: () => api<Stream[]>(`/v1/streams?userId=${user?.id ?? ""}`),
    enabled: !!user?.id
  });

  useEffect(() => {
    if (!user?.id || !streams.isSuccess || !streams.data) return;
    const open = streams.data
      .filter((s) => !s.ended_at)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
    if (open) {
      setActiveStreamId((prev) => prev ?? open.id);
    } else {
      setActiveStreamId((prev) => {
        if (!prev) return null;
        const stillLive = streams.data!.some((s) => s.id === prev && !s.ended_at);
        return stillLive ? prev : null;
      });
    }
  }, [user?.id, streams.isSuccess, streams.data]);

  const streamItems = useQuery({
    queryKey: ["stream-items", activeStreamId],
    queryFn: () => api<StreamItemRow[]>(`/v1/streams/${activeStreamId}/items`),
    enabled: !!activeStreamId
  });

  const breaks = useQuery({
    queryKey: ["breaks"],
    queryFn: () => api<BreakRow[]>("/v1/breaks")
  });

  const activeBreak = useQuery({
    queryKey: ["active-stream-break", activeStreamId],
    queryFn: () => api<ActiveBreakResponse>(`/v1/streams/${activeStreamId}/break`),
    enabled: !!activeStreamId
  });

  const breakStats = useQuery({
    queryKey: ["stream-break-stats", activeStreamId],
    queryFn: () => api<BreakStats>(`/v1/streams/${activeStreamId}/break-stats`),
    enabled: !!activeStreamId
  });

  useEffect(() => {
    const b = breaks.data?.find((x) => x.id === selectedBreakId);
    if (b?.fixed_silver_spots != null) {
      setFloorSpotsInput(String(b.fixed_silver_spots));
    }
  }, [selectedBreakId, breaks.data]);

  const startMutation = useMutation({
    mutationFn: () =>
      api<Stream>("/v1/streams/start", {
        method: "POST",
        body: JSON.stringify({
          userId: user?.id
        })
      }),
    onSuccess: (stream) => {
      setActiveStreamId(stream.id);
      setIsStartCardOpen(false);
      void qc.invalidateQueries({ queryKey: ["streams", user?.id] });
      void qc.invalidateQueries({ queryKey: ["stream-items", stream.id] });
      void qc.invalidateQueries({ queryKey: ["active-stream-break", stream.id] });
      void qc.invalidateQueries({ queryKey: ["stream-break-stats", stream.id] });
    }
  });

  const startBreakMutation = useMutation({
    mutationFn: () => {
      const floorSpots = Math.max(0, Math.floor(Number(floorSpotsInput) || 0));
      return api(`/v1/streams/${activeStreamId}/breaks/start`, {
        method: "POST",
        body: JSON.stringify({
          breakId: selectedBreakId,
          floorSpots
        })
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["active-stream-break", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-break-stats", activeStreamId] });
    }
  });

  const endBreakMutation = useMutation({
    mutationFn: (streamBreakId: string) =>
      api<{ ok: boolean }>(`/v1/streams/${activeStreamId}/breaks/${streamBreakId}/end`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["active-stream-break", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-break-stats", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
    }
  });

  const processSpotMutation = useMutation({
    mutationFn: () =>
      api(`/v1/streams/${activeStreamId}/breaks/${activeBreak.data?.streamBreak?.id}/process-spot`, {
        method: "POST",
        body: JSON.stringify({
          outcomeType,
          prizeSlotId: outcomeType === "prize" ? selectedPrizeSlotId : undefined
        })
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["active-stream-break", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-break-stats", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["batches"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api<{ ok: boolean }>(`/v1/streams/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["active-stream-break", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-break-stats", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["batches"] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
    }
  });

  const endMutation = useMutation({
    mutationFn: (streamId: string) =>
      api<{ ok: boolean; discarded?: boolean; idempotent?: boolean }>(`/v1/streams/${streamId}/end`, {
        method: "POST"
      }),
    onSuccess: (result, streamId) => {
      setActiveStreamId(null);
      const uid = user?.id;
      if (uid) {
        if (result.discarded) {
          qc.setQueryData<Stream[]>(["streams", uid], (old) => old?.filter((s) => s.id !== streamId) ?? old);
        } else {
          qc.setQueryData<Stream[]>(["streams", uid], (old) =>
            old?.map((s) =>
              s.id === streamId ? { ...s, ended_at: new Date().toISOString() } : s
            ) ?? old
          );
        }
      }
      void qc.invalidateQueries({ queryKey: ["streams", user?.id] });
      void qc.removeQueries({ queryKey: ["stream-items", streamId] });
      void qc.removeQueries({ queryKey: ["active-stream-break", streamId] });
      void qc.removeQueries({ queryKey: ["stream-break-stats", streamId] });
      void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
      void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
    }
  });

  const itemCount = streamItems.data?.length ?? 0;

  const requestEnd = () => {
    const streamId = activeStreamId;
    if (!streamId) return;
    if (itemCount === 0) {
      const ok = window.confirm("No sales logged — discard this session?");
      if (!ok) return;
    }
    endMutation.mutate(streamId);
  };

  const nextSpotNumber = useMemo(
    () => activeBreak.data?.spots?.find((spot) => !spot.processed_at)?.spot_number ?? null,
    [activeBreak.data?.spots]
  );
  const availablePrizeSlots = useMemo(
    () => (activeBreak.data?.prizeSlots ?? []).filter((slot) => Number(slot.is_consumed) !== 1),
    [activeBreak.data?.prizeSlots]
  );

  const prizeTotal = activeBreak.data?.streamBreak?.prize_slot_count ?? 10;
  const startDisabled = !user || startMutation.isPending || activeStreamId !== null;

  return (
    <section className={`card${activeStreamId ? " stream-session-card" : ""}`}>
      <h2>Streams</h2>

      {!activeStreamId ? (
        <>
          <button
            type="button"
            className="btn btn-gold"
            style={{ marginTop: "0.75rem" }}
            onClick={() => setIsStartCardOpen(true)}
            disabled={startDisabled}
          >
            Start stream
          </button>
          {isStartCardOpen ? (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => startMutation.mutate()}
                  disabled={!user || startMutation.isPending}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsStartCardOpen(false)}
                  disabled={startMutation.isPending}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="stream-live-bar">
            <span className="stream-live-dot" aria-hidden />
            <span className="stream-live-label">LIVE</span>
          </div>
          <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
            Session active · run break spots below
          </p>

          {breakStats.data ? (
            <div
              style={{
                fontSize: "0.7rem",
                marginBottom: "0.75rem",
                padding: "0.5rem",
                background: "var(--surface-2, rgba(0,0,0,0.15))",
                borderRadius: "6px"
              }}
            >
              <strong>Session break totals</strong> · break COGS ${breakStats.data.totalBreakCost.toFixed(2)} · floor
              silver sold {breakStats.data.totalFloorSilverGrams.toFixed(4)}g
            </div>
          ) : null}

          {!activeBreak.data?.streamBreak ? (
            <div className="grid-form">
              <select value={selectedBreakId} onChange={(e) => setSelectedBreakId(e.target.value)}>
                <option value="">Select break</option>
                {(breaks.data ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.total_spots ?? "?"} spots · {row.prize_slot_count ?? "?"} prizes
                  </option>
                ))}
              </select>
              <label style={{ fontSize: "0.7rem", color: "var(--muted)", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                Floor spots (this run, for tracking)
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  value={floorSpotsInput}
                  onChange={(e) => setFloorSpotsInput(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => startBreakMutation.mutate()}
                disabled={!selectedBreakId || startBreakMutation.isPending}
              >
                Start break run
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.7rem", marginBottom: "0.35rem" }}>
                <strong>{activeBreak.data.streamBreak.break_name}</strong> · prizes sold{" "}
                {activeBreak.data.streamBreak.sold_prize_spots}/{prizeTotal} · remaining silver{" "}
                {Number(activeBreak.data.streamBreak.remaining_silver_grams).toFixed(2)}g · this run floor spots{" "}
                <strong>{activeBreak.data.streamBreak.floor_spots}</strong>
              </div>
              <div className="grid-form">
                <input value={nextSpotNumber == null ? "Complete" : `Spot ${nextSpotNumber}`} readOnly />
                <select
                  value={outcomeType}
                  onChange={(e) => setOutcomeType(e.target.value as "silver" | "prize")}
                >
                  <option value="silver">Silver (1g)</option>
                  <option value="prize">Prize</option>
                </select>
                {outcomeType === "prize" ? (
                  <select value={selectedPrizeSlotId} onChange={(e) => setSelectedPrizeSlotId(e.target.value)}>
                    <option value="">Select prize slot</option>
                    {availablePrizeSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        Slot {slot.slot_number} {slot.slot_type} · {slot.grams}g {slot.metal}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={() => processSpotMutation.mutate()}
                  disabled={
                    processSpotMutation.isPending ||
                    nextSpotNumber == null ||
                    (outcomeType === "prize" && !selectedPrizeSlotId)
                  }
                >
                  Process spot
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={endBreakMutation.isPending || !activeBreak.data.streamBreak?.id}
                  onClick={() => {
                    if (!activeBreak.data?.streamBreak?.id) return;
                    if (!window.confirm("End this break run now? You can start another break afterward.")) return;
                    endBreakMutation.mutate(activeBreak.data.streamBreak.id);
                  }}
                >
                  Next break
                </button>
              </div>
            </div>
          )}
          {startBreakMutation.isError ? (
            <p className="error" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
              {(startBreakMutation.error as Error).message}
            </p>
          ) : null}
          {endBreakMutation.isError ? (
            <p className="error" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
              {(endBreakMutation.error as Error).message}
            </p>
          ) : null}
          {processSpotMutation.isError ? (
            <p className="error" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
              {(processSpotMutation.error as Error).message}
            </p>
          ) : null}

          <div style={{ marginTop: "1rem" }}>
            <div style={{ fontSize: "0.65rem", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: "0.5rem" }}>
              SESSION SALES
            </div>
            {streamItems.isLoading ? (
              <p style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Loading…</p>
            ) : streamItems.error ? (
              <p className="error">{(streamItems.error as Error).message}</p>
            ) : itemCount === 0 ? (
              <p style={{ fontSize: "0.7rem", color: "var(--muted)" }}>No spots processed yet.</p>
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
                      <th aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {streamItems.data!.map((it) => (
                      <tr key={it.id}>
                        <td>{it.sale_type}</td>
                        <td>{it.name}</td>
                        <td>{it.metal}</td>
                        <td>{Number(it.weight_grams).toFixed(4)}</td>
                        <td className="tbl-green">${Number(it.spot_value).toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={deleteItemMutation.isPending || endMutation.isPending}
                            onClick={() => {
                              if (!window.confirm("Remove this sale from the session?")) return;
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
          </div>
        </>
      )}

      <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "1rem" }}>
        My stream records: {streams.data?.length ?? 0}
      </p>

      {activeStreamId ? (
        <div className="stream-card-footer">
          <button
            type="button"
            className="btn btn-outline stream-end-btn"
            disabled={endMutation.isPending}
            onClick={requestEnd}
          >
            End stream
          </button>
        </div>
      ) : null}
    </section>
  );
}
