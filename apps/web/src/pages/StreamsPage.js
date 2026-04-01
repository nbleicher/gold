import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
export function StreamsPage() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const [activeStreamId, setActiveStreamId] = useState(null);
    const [saleCount, setSaleCount] = useState(0);
    const [goldBatchId, setGoldBatchId] = useState("");
    const [silverBatchId, setSilverBatchId] = useState("");
    const [stickerCode, setStickerCode] = useState("");
    const [rawMetal, setRawMetal] = useState("gold");
    const [rawWeight, setRawWeight] = useState("0.0000");
    const batches = useQuery({
        queryKey: ["batches"],
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
            body: JSON.stringify({
                userId: user?.id,
                goldBatchId: goldBatchId || null,
                silverBatchId: silverBatchId || null
            })
        }),
        onSuccess: (stream) => {
            setActiveStreamId(stream.id);
            setSaleCount(0);
        }
    });
    const stickerMutation = useMutation({
        mutationFn: () => api("/v1/streams/sticker-sale", {
            method: "POST",
            body: JSON.stringify({ streamId: activeStreamId, stickerCode })
        }),
        onSuccess: () => {
            setStickerCode("");
            setSaleCount((c) => c + 1);
        }
    });
    const rawMutation = useMutation({
        mutationFn: () => api("/v1/streams/raw-sale", {
            method: "POST",
            body: JSON.stringify({ streamId: activeStreamId, metal: rawMetal, weightGrams: Number(rawWeight) })
        }),
        onSuccess: () => {
            setRawWeight("0.0000");
            setSaleCount((c) => c + 1);
        }
    });
    const endMutation = useMutation({
        mutationFn: (streamId) => api(`/v1/streams/${streamId}/end`, {
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
        if (!streamId)
            return;
        if (saleCount === 0) {
            const ok = window.confirm("No sales logged — discard this session?");
            if (!ok)
                return;
        }
        endMutation.mutate(streamId);
    };
    return (_jsxs("section", { className: `card${activeStreamId ? " stream-session-card" : ""}`, children: [_jsx("h2", { children: "Streams" }), !activeStreamId ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid-form", children: [_jsxs("select", { value: goldBatchId, onChange: (e) => setGoldBatchId(e.target.value), children: [_jsx("option", { value: "", children: "Gold raw batch" }), (batches.data ?? [])
                                        .filter((b) => b.metal === "gold")
                                        .map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name, " \u00B7 ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id)))] }), _jsxs("select", { value: silverBatchId, onChange: (e) => setSilverBatchId(e.target.value), children: [_jsx("option", { value: "", children: "Silver raw batch" }), (batches.data ?? [])
                                        .filter((b) => b.metal === "silver")
                                        .map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name, " \u00B7 ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id)))] })] }), _jsx("button", { type: "button", className: "btn btn-gold", style: { marginTop: "0.75rem" }, onClick: () => startMutation.mutate(), disabled: !user || startMutation.isPending, children: "Start stream" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stream-live-bar", children: [_jsx("span", { className: "stream-live-dot", "aria-hidden": true }), _jsx("span", { className: "stream-live-label", children: "LIVE" })] }), _jsx("p", { style: { fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.75rem" }, children: "Session active \u00B7 add sales below" }), _jsxs("div", { className: "grid-form", children: [_jsx("input", { value: stickerCode, onChange: (e) => setStickerCode(e.target.value), placeholder: "sticker code", disabled: endMutation.isPending }), _jsx("button", { type: "button", onClick: () => stickerMutation.mutate(), disabled: stickerMutation.isPending || endMutation.isPending, children: "Add sticker sale" }), _jsxs("select", { value: rawMetal, onChange: (e) => setRawMetal(e.target.value), disabled: endMutation.isPending, children: [_jsx("option", { value: "gold", children: "Gold" }), _jsx("option", { value: "silver", children: "Silver" })] }), _jsx("input", { value: rawWeight, onChange: (e) => setRawWeight(e.target.value), placeholder: "raw grams", disabled: endMutation.isPending }), _jsx("button", { type: "button", onClick: () => rawMutation.mutate(), disabled: rawMutation.isPending || endMutation.isPending, children: "Add raw sale" })] })] })), _jsxs("p", { style: { fontSize: "0.65rem", color: "var(--muted)", marginTop: "1rem" }, children: ["My stream records: ", streams.data?.length ?? 0] }), activeStreamId ? (_jsx("div", { className: "stream-card-footer", children: _jsx("button", { type: "button", className: "btn btn-outline stream-end-btn", disabled: endMutation.isPending, onClick: requestEnd, children: "End stream" }) })) : null] }));
}
