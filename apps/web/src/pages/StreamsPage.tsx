import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Stream = {
  id: string;
  started_at: string;
  ended_at: string | null;
  gold_batch_id: string | null;
  silver_batch_id: string | null;
};

type StreamItemRow = {
  id: string;
  sale_type: string;
  name: string;
  metal: string;
  weight_grams: number;
  spot_value: number;
  spot_price: number;
  sticker_code: string | null;
};

type StreamBatchRow = {
  id: string;
  metal: "gold" | "silver";
  batch_name: string | null;
  remaining_grams: number;
};

export function StreamsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [isStartCardOpen, setIsStartCardOpen] = useState(false);
  const [stickerCode, setStickerCode] = useState("");
  const [rawMetal, setRawMetal] = useState<"gold" | "silver">("gold");
  const [rawWeight, setRawWeight] = useState("");

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

  const activeStream = useMemo(
    () => streams.data?.find((s) => s.id === activeStreamId) ?? null,
    [streams.data, activeStreamId]
  );

  const streamBatches = useQuery({
    queryKey: ["stream-batches", activeStreamId],
    queryFn: () => api<StreamBatchRow[]>(`/v1/streams/${activeStreamId}/batches`),
    enabled: !!activeStreamId
  });

  const { canRawGold, canRawSilver } = useMemo(() => {
    const rows = streamBatches.data;
    const fetched = streamBatches.isFetched;
    if (!fetched) {
      return { canRawGold: true, canRawSilver: true };
    }
    if (rows && rows.length > 0) {
      return {
        canRawGold: rows.some((b) => b.metal === "gold" && Number(b.remaining_grams) > 0),
        canRawSilver: rows.some((b) => b.metal === "silver" && Number(b.remaining_grams) > 0)
      };
    }
    return {
      canRawGold: Boolean(activeStream?.gold_batch_id),
      canRawSilver: Boolean(activeStream?.silver_batch_id)
    };
  }, [streamBatches.data, streamBatches.isFetched, activeStream]);

  const rawBlocked =
    (rawMetal === "gold" && !canRawGold) || (rawMetal === "silver" && !canRawSilver);

  const streamItems = useQuery({
    queryKey: ["stream-items", activeStreamId],
    queryFn: () => api<StreamItemRow[]>(`/v1/streams/${activeStreamId}/items`),
    enabled: !!activeStreamId
  });

  const startMutation = useMutation({
    mutationFn: () =>
      api<Stream>("/v1/streams/start", {
        method: "POST",
        body: JSON.stringify({
          userId: user?.id,
          goldBatchId: null,
          silverBatchId: null
        })
      }),
    onSuccess: (stream) => {
      setActiveStreamId(stream.id);
      setIsStartCardOpen(false);
      void qc.invalidateQueries({ queryKey: ["streams", user?.id] });
      void qc.invalidateQueries({ queryKey: ["stream-items", stream.id] });
      void qc.invalidateQueries({ queryKey: ["stream-batches", stream.id] });
    }
  });

  const stickerMutation = useMutation({
    mutationFn: () =>
      api("/v1/streams/sticker-sale", {
        method: "POST",
        body: JSON.stringify({
          streamId: activeStreamId,
          stickerCode: stickerCode.trim()
        })
      }),
    onSuccess: () => {
      setStickerCode("");
      void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["bag-orders"] });
    }
  });

  const rawMutation = useMutation({
    mutationFn: () =>
      api("/v1/streams/raw-sale", {
        method: "POST",
        body: JSON.stringify({
          streamId: activeStreamId,
          metal: rawMetal,
          weightGrams: Number(rawWeight)
        })
      }),
    onSuccess: () => {
      setRawWeight("");
      void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-batches", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["batches"] });
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api<{ ok: boolean }>(`/v1/streams/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["stream-batches", activeStreamId] });
      void qc.invalidateQueries({ queryKey: ["batches"] });
      void qc.invalidateQueries({ queryKey: ["bag-orders"] });
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
      void qc.removeQueries({ queryKey: ["stream-batches", streamId] });
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

  const onAddSticker = () => {
    stickerMutation.mutate();
  };

  const onAddRaw = () => {
    const w = Number(rawWeight);
    if (!(w > 0)) return;
    rawMutation.mutate();
  };

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
            Session active · add sales below
          </p>
          <div className="grid-form">
            <input
              value={stickerCode}
              onChange={(e) => setStickerCode(e.target.value)}
              placeholder="sticker code"
              disabled={endMutation.isPending}
            />
            <button
              type="button"
              onClick={onAddSticker}
              disabled={
                stickerMutation.isPending ||
                endMutation.isPending ||
                stickerCode.trim().length < 2
              }
            >
              Add sticker sale
            </button>
            <select
              value={rawMetal}
              onChange={(e) => setRawMetal(e.target.value as "gold" | "silver")}
              disabled={endMutation.isPending}
            >
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
            </select>
            <input
              value={rawWeight}
              onChange={(e) => setRawWeight(e.target.value)}
              placeholder="raw grams"
              type="number"
              min={0}
              step="0.0001"
              disabled={endMutation.isPending || rawBlocked}
            />
            <button
              type="button"
              onClick={onAddRaw}
              disabled={
                rawMutation.isPending || endMutation.isPending || rawBlocked || !(Number(rawWeight) > 0)
              }
            >
              Add raw sale
            </button>
          </div>
          {rawBlocked ? (
            <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.5rem", marginBottom: 0 }}>
              No {rawMetal} batch in this session with remaining stock for a raw pull — sticker sales still work.
            </p>
          ) : null}
          {stickerMutation.isError ? (
            <p className="error" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
              {(stickerMutation.error as Error).message}
            </p>
          ) : null}
          {rawMutation.isError ? (
            <p className="error" style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
              {(rawMutation.error as Error).message}
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
              <p style={{ fontSize: "0.7rem", color: "var(--muted)" }}>No sales yet — add a sticker or raw sale above.</p>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Sticker / name</th>
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
                        <td>{it.sale_type === "sticker" ? it.sticker_code ?? it.name : it.name}</td>
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
