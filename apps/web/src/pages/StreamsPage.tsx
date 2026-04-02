import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Stream = { id: string; started_at: string };
type Batch = { id: string; batch_name: string; metal: "gold" | "silver"; remaining_grams: number };

export function StreamsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [saleCount, setSaleCount] = useState(0);
  const [isStartCardOpen, setIsStartCardOpen] = useState(false);
  const [goldBatchId, setGoldBatchId] = useState("");
  const [silverBatchId, setSilverBatchId] = useState("");
  const [stickerCode, setStickerCode] = useState("");
  const [rawMetal, setRawMetal] = useState<"gold" | "silver">("gold");
  const [rawWeight, setRawWeight] = useState("0.0000");

  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });

  const streams = useQuery({
    queryKey: ["streams", user?.id],
    queryFn: () => api<Stream[]>(`/v1/streams?userId=${user?.id ?? ""}`),
    enabled: !!user?.id
  });

  const startMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/v1/streams/start", {
        method: "POST",
        body: JSON.stringify({
          userId: user?.id,
          goldBatchId: goldBatchId || null,
          silverBatchId: silverBatchId || null
        })
      }),
    onSuccess: (stream) => {
      setActiveStreamId(stream.id);
      setSaleCount(0);
      setIsStartCardOpen(false);
      setGoldBatchId("");
      setSilverBatchId("");
    }
  });

  const stickerMutation = useMutation({
    mutationFn: () =>
      api("/v1/streams/sticker-sale", {
        method: "POST",
        body: JSON.stringify({ streamId: activeStreamId, stickerCode })
      }),
    onSuccess: () => {
      setStickerCode("");
      setSaleCount((c) => c + 1);
    }
  });

  const rawMutation = useMutation({
    mutationFn: () =>
      api("/v1/streams/raw-sale", {
        method: "POST",
        body: JSON.stringify({ streamId: activeStreamId, metal: rawMetal, weightGrams: Number(rawWeight) })
      }),
    onSuccess: () => {
      setRawWeight("0.0000");
      setSaleCount((c) => c + 1);
    }
  });

  const endMutation = useMutation({
    mutationFn: (streamId: string) =>
      api<{ ok: boolean; discarded?: boolean; idempotent?: boolean }>(`/v1/streams/${streamId}/end`, {
        method: "POST"
      }),
    onSuccess: () => {
      setActiveStreamId(null);
      setSaleCount(0);
      qc.invalidateQueries({ queryKey: ["streams", user?.id] });
    }
  });

  const requestEnd = () => {
    const streamId = activeStreamId;
    if (!streamId) return;
    if (saleCount === 0) {
      const ok = window.confirm("No sales logged — discard this session?");
      if (!ok) return;
    }
    endMutation.mutate(streamId);
  };

  const hasSelectedStartBatch = Boolean(goldBatchId || silverBatchId);

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
            disabled={!user || startMutation.isPending}
          >
            Start stream
          </button>
          {isStartCardOpen ? (
            <div style={{ marginTop: "0.75rem" }}>
              <div className="grid-form">
                <select value={goldBatchId} onChange={(e) => setGoldBatchId(e.target.value)}>
                  <option value="">Gold raw batch</option>
                  {(batches.data ?? [])
                    .filter((b) => b.metal === "gold")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_name} · {Number(b.remaining_grams).toFixed(4)}g
                      </option>
                    ))}
                </select>
                <select value={silverBatchId} onChange={(e) => setSilverBatchId(e.target.value)}>
                  <option value="">Silver raw batch</option>
                  {(batches.data ?? [])
                    .filter((b) => b.metal === "silver")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batch_name} · {Number(b.remaining_grams).toFixed(4)}g
                      </option>
                    ))}
                </select>
              </div>
              {!hasSelectedStartBatch ? (
                <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.5rem", marginBottom: 0 }}>
                  Select at least one metal batch to start stream.
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => startMutation.mutate()}
                  disabled={!user || startMutation.isPending || !hasSelectedStartBatch}
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
              onClick={() => stickerMutation.mutate()}
              disabled={stickerMutation.isPending || endMutation.isPending}
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
              disabled={endMutation.isPending}
            />
            <button
              type="button"
              onClick={() => rawMutation.mutate()}
              disabled={rawMutation.isPending || endMutation.isPending}
            >
              Add raw sale
            </button>
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
