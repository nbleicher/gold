import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
export function StreamsPage() {
    const { user } = useAuth();
    const [activeStreamId, setActiveStreamId] = useState(null);
    const [goldBatchId, setGoldBatchId] = useState("");
    const [silverBatchId, setSilverBatchId] = useState("");
    const [stickerCode, setStickerCode] = useState("");
    const [rawMetal, setRawMetal] = useState("gold");
    const [rawWeight, setRawWeight] = useState("0.0000");
    const batches = useQuery({
        queryKey: ["stream-batches"],
        queryFn: () => api("/v1/inventory/batches")
    });
    const streams = useQuery({
        queryKey: ["streams", user?.id],
        queryFn: () => api(`/v1/streams?userId=${user?.id ?? ""}`),
        enabled: !!user?.id
    });
    const startMutation = useMutation({
        mutationFn: () => api("/v1/streams/start", {
            method: "POST",
            body: JSON.stringify({ userId: user?.id, goldBatchId: goldBatchId || null, silverBatchId: silverBatchId || null })
        }),
        onSuccess: (stream) => setActiveStreamId(stream.id)
    });
    const stickerMutation = useMutation({
        mutationFn: () => api("/v1/streams/sticker-sale", {
            method: "POST",
            body: JSON.stringify({ streamId: activeStreamId, stickerCode })
        }),
        onSuccess: () => setStickerCode("")
    });
    const rawMutation = useMutation({
        mutationFn: () => api("/v1/streams/raw-sale", {
            method: "POST",
            body: JSON.stringify({ streamId: activeStreamId, metal: rawMetal, weightGrams: Number(rawWeight) })
        }),
        onSuccess: () => setRawWeight("0.0000")
    });
    const endMutation = useMutation({
        mutationFn: () => api(`/v1/streams/${activeStreamId}/end`, { method: "POST" }),
        onSuccess: () => setActiveStreamId(null)
    });
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Streams" }), _jsxs("div", { className: "grid-form", children: [_jsxs("select", { value: goldBatchId, onChange: (e) => setGoldBatchId(e.target.value), children: [_jsx("option", { value: "", children: "Gold raw batch" }), (batches.data ?? [])
                                .filter((b) => b.metal === "gold")
                                .map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name, " \u00B7 ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id)))] }), _jsxs("select", { value: silverBatchId, onChange: (e) => setSilverBatchId(e.target.value), children: [_jsx("option", { value: "", children: "Silver raw batch" }), (batches.data ?? [])
                                .filter((b) => b.metal === "silver")
                                .map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name, " \u00B7 ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id)))] })] }), _jsx("button", { onClick: () => startMutation.mutate(), disabled: !user || startMutation.isPending, children: "Start Stream" }), _jsxs("p", { children: ["Active stream: ", activeStreamId ?? "none"] }), _jsxs("p", { children: ["My stream records loaded: ", streams.data?.length ?? 0] }), activeStreamId ? (_jsxs("div", { className: "grid-form", children: [_jsx("input", { value: stickerCode, onChange: (e) => setStickerCode(e.target.value), placeholder: "sticker code" }), _jsx("button", { onClick: () => stickerMutation.mutate(), disabled: stickerMutation.isPending, children: "Add sticker sale" }), _jsxs("select", { value: rawMetal, onChange: (e) => setRawMetal(e.target.value), children: [_jsx("option", { value: "gold", children: "Gold" }), _jsx("option", { value: "silver", children: "Silver" })] }), _jsx("input", { value: rawWeight, onChange: (e) => setRawWeight(e.target.value), placeholder: "raw grams" }), _jsx("button", { onClick: () => rawMutation.mutate(), disabled: rawMutation.isPending, children: "Add raw sale" }), _jsx("button", { onClick: () => endMutation.mutate(), disabled: endMutation.isPending, children: "End Stream" })] })) : null] }));
}
