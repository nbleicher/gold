import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type Stream = { id: string; started_at: string };
type Batch = { id: string; batch_name: string; metal: "gold" | "silver"; remaining_grams: number };

export function StreamsPage() {
  const { user } = useAuth();
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [goldBatchId, setGoldBatchId] = useState("");
  const [silverBatchId, setSilverBatchId] = useState("");
  const [stickerCode, setStickerCode] = useState("");
  const [rawMetal, setRawMetal] = useState<"gold" | "silver">("gold");
  const [rawWeight, setRawWeight] = useState("0.0000");

  const batches = useQuery({
    queryKey: ["stream-batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });

  const streams = useQuery({
    queryKey: ["streams", user?.id],
    queryFn: () => api<Stream[]>(`/v1/streams?userId=${user?.id ?? ""}`),
    enabled: !!user?.id
  });

  const startMutation = useMutation({
    mutationFn: () => api<{ id: string }>("/v1/streams/start", {
      method: "POST",
      body: JSON.stringify({ userId: user?.id, goldBatchId: goldBatchId || null, silverBatchId: silverBatchId || null })
    }),
    onSuccess: (stream) => setActiveStreamId(stream.id)
  });

  const stickerMutation = useMutation({
    mutationFn: () =>
      api("/v1/streams/sticker-sale", {
        method: "POST",
        body: JSON.stringify({ streamId: activeStreamId, stickerCode })
      }),
    onSuccess: () => setStickerCode("")
  });

  const rawMutation = useMutation({
    mutationFn: () =>
      api("/v1/streams/raw-sale", {
        method: "POST",
        body: JSON.stringify({ streamId: activeStreamId, metal: rawMetal, weightGrams: Number(rawWeight) })
      }),
    onSuccess: () => setRawWeight("0.0000")
  });

  const endMutation = useMutation({
    mutationFn: () => api(`/v1/streams/${activeStreamId}/end`, { method: "POST" }),
    onSuccess: () => setActiveStreamId(null)
  });

  return (
    <section className="card">
      <h2>Streams</h2>
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
      <button onClick={() => startMutation.mutate()} disabled={!user || startMutation.isPending}>
        Start Stream
      </button>
      <p>Active stream: {activeStreamId ?? "none"}</p>
      <p>My stream records loaded: {streams.data?.length ?? 0}</p>
      {activeStreamId ? (
        <div className="grid-form">
          <input
            value={stickerCode}
            onChange={(e) => setStickerCode(e.target.value)}
            placeholder="sticker code"
          />
          <button onClick={() => stickerMutation.mutate()} disabled={stickerMutation.isPending}>
            Add sticker sale
          </button>
          <select value={rawMetal} onChange={(e) => setRawMetal(e.target.value as "gold" | "silver")}>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
          </select>
          <input value={rawWeight} onChange={(e) => setRawWeight(e.target.value)} placeholder="raw grams" />
          <button onClick={() => rawMutation.mutate()} disabled={rawMutation.isPending}>
            Add raw sale
          </button>
          <button onClick={() => endMutation.mutate()} disabled={endMutation.isPending}>
            End Stream
          </button>
        </div>
      ) : null}
    </section>
  );
}
