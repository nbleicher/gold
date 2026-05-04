import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
function rawSaleBatchLabel(it, batches) {
    if (it.sale_type !== "raw" || !it.batch_id)
        return "—";
    const name = batches?.find((b) => b.id === it.batch_id)?.batch_name?.trim();
    if (name)
        return name;
    return `${it.batch_id.slice(0, 8)}…`;
}
export function StreamsPage() {
    const qc = useQueryClient();
    const { user } = useAuth();
    const [activeStreamId, setActiveStreamId] = useState(null);
    const [isStartCardOpen, setIsStartCardOpen] = useState(false);
    const [stickerCode, setStickerCode] = useState("");
    const [rawMetal, setRawMetal] = useState("gold");
    const [rawWeight, setRawWeight] = useState("");
    const streams = useQuery({
        queryKey: ["streams", user?.id],
        queryFn: () => api(`/v1/streams?userId=${user?.id ?? ""}`),
        enabled: !!user?.id
    });
    useEffect(() => {
        if (!user?.id || !streams.isSuccess || !streams.data)
            return;
        const open = streams.data
            .filter((s) => !s.ended_at)
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
        if (open) {
            setActiveStreamId((prev) => prev ?? open.id);
        }
        else {
            setActiveStreamId((prev) => {
                if (!prev)
                    return null;
                const stillLive = streams.data.some((s) => s.id === prev && !s.ended_at);
                return stillLive ? prev : null;
            });
        }
    }, [user?.id, streams.isSuccess, streams.data]);
    const activeStream = useMemo(() => streams.data?.find((s) => s.id === activeStreamId) ?? null, [streams.data, activeStreamId]);
    const streamBatches = useQuery({
        queryKey: ["stream-batches", activeStreamId],
        queryFn: () => api(`/v1/streams/${activeStreamId}/batches`),
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
    const rawBlocked = (rawMetal === "gold" && !canRawGold) || (rawMetal === "silver" && !canRawSilver);
    const streamItems = useQuery({
        queryKey: ["stream-items", activeStreamId],
        queryFn: () => api(`/v1/streams/${activeStreamId}/items`),
        enabled: !!activeStreamId
    });
    const startMutation = useMutation({
        mutationFn: () => api("/v1/streams/start", {
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
        mutationFn: () => api("/v1/streams/sticker-sale", {
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
            void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
        }
    });
    const rawMutation = useMutation({
        mutationFn: () => api("/v1/streams/raw-sale", {
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
            void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
        }
    });
    const deleteItemMutation = useMutation({
        mutationFn: (itemId) => api(`/v1/streams/items/${itemId}`, { method: "DELETE" }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["stream-items", activeStreamId] });
            void qc.invalidateQueries({ queryKey: ["stream-batches", activeStreamId] });
            void qc.invalidateQueries({ queryKey: ["batches"] });
            void qc.invalidateQueries({ queryKey: ["bag-orders"] });
            void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
        }
    });
    const endMutation = useMutation({
        mutationFn: (streamId) => api(`/v1/streams/${streamId}/end`, {
            method: "POST"
        }),
        onSuccess: (result, streamId) => {
            setActiveStreamId(null);
            const uid = user?.id;
            if (uid) {
                if (result.discarded) {
                    qc.setQueryData(["streams", uid], (old) => old?.filter((s) => s.id !== streamId) ?? old);
                }
                else {
                    qc.setQueryData(["streams", uid], (old) => old?.map((s) => s.id === streamId ? { ...s, ended_at: new Date().toISOString() } : s) ?? old);
                }
            }
            void qc.invalidateQueries({ queryKey: ["streams", user?.id] });
            void qc.removeQueries({ queryKey: ["stream-items", streamId] });
            void qc.removeQueries({ queryKey: ["stream-batches", streamId] });
            void qc.invalidateQueries({ queryKey: ["admin-profit-metrics"] });
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
        }
    });
    const itemCount = streamItems.data?.length ?? 0;
    const requestEnd = () => {
        const streamId = activeStreamId;
        if (!streamId)
            return;
        if (itemCount === 0) {
            const ok = window.confirm("No sales logged — discard this session?");
            if (!ok)
                return;
        }
        endMutation.mutate(streamId);
    };
    const onAddSticker = () => {
        stickerMutation.mutate();
    };
    const onAddRaw = () => {
        const w = Number(rawWeight);
        if (!(w > 0))
            return;
        rawMutation.mutate();
    };
    const startDisabled = !user || startMutation.isPending || activeStreamId !== null;
    return (_jsxs("section", { className: `card${activeStreamId ? " stream-session-card" : ""}`, children: [_jsx("h2", { children: "Streams" }), !activeStreamId ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn btn-gold", style: { marginTop: "0.75rem" }, onClick: () => setIsStartCardOpen(true), disabled: startDisabled, children: "Start stream" }), isStartCardOpen ? (_jsx("div", { style: { marginTop: "0.75rem" }, children: _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("button", { type: "button", className: "btn btn-gold", onClick: () => startMutation.mutate(), disabled: !user || startMutation.isPending, children: "Confirm" }), _jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setIsStartCardOpen(false), disabled: startMutation.isPending, children: "Cancel" })] }) })) : null] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stream-live-bar", children: [_jsx("span", { className: "stream-live-dot", "aria-hidden": true }), _jsx("span", { className: "stream-live-label", children: "LIVE" })] }), _jsx("p", { style: { fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.75rem" }, children: "Session active \u00B7 add sales below" }), _jsxs("div", { className: "grid-form", children: [_jsx("input", { value: stickerCode, onChange: (e) => setStickerCode(e.target.value), placeholder: "sticker code", disabled: endMutation.isPending }), _jsx("button", { type: "button", onClick: onAddSticker, disabled: stickerMutation.isPending ||
                                    endMutation.isPending ||
                                    stickerCode.trim().length < 2, children: "Add sticker sale" }), _jsxs("select", { value: rawMetal, onChange: (e) => setRawMetal(e.target.value), disabled: endMutation.isPending, children: [_jsx("option", { value: "gold", children: "Gold" }), _jsx("option", { value: "silver", children: "Silver" })] }), _jsx("input", { value: rawWeight, onChange: (e) => setRawWeight(e.target.value), placeholder: "raw grams", type: "number", min: 0, step: "0.0001", disabled: endMutation.isPending || rawBlocked }), _jsx("button", { type: "button", onClick: onAddRaw, disabled: rawMutation.isPending || endMutation.isPending || rawBlocked || !(Number(rawWeight) > 0), children: "Add raw sale" })] }), rawBlocked ? (_jsxs("p", { style: { fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.5rem", marginBottom: 0 }, children: ["No ", rawMetal, " batch in this session with remaining stock for a raw pull \u2014 sticker sales still work."] })) : null, stickerMutation.isError ? (_jsx("p", { className: "error", style: { marginTop: "0.5rem", fontSize: "0.75rem" }, children: stickerMutation.error.message })) : null, rawMutation.isError ? (_jsx("p", { className: "error", style: { marginTop: "0.5rem", fontSize: "0.75rem" }, children: rawMutation.error.message })) : null, _jsxs("div", { style: { marginTop: "1rem" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.1em", color: "var(--muted)", marginBottom: "0.5rem" }, children: "SESSION SALES" }), streamItems.isLoading ? (_jsx("p", { style: { fontSize: "0.7rem", color: "var(--muted)" }, children: "Loading\u2026" })) : streamItems.error ? (_jsx("p", { className: "error", children: streamItems.error.message })) : itemCount === 0 ? (_jsx("p", { style: { fontSize: "0.7rem", color: "var(--muted)" }, children: "No sales yet \u2014 add a sticker or raw sale above." })) : (_jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Type" }), _jsx("th", { children: "Sticker / name" }), _jsx("th", { children: "Metal" }), _jsx("th", { children: "Batch" }), _jsx("th", { children: "Weight (g)" }), _jsx("th", { children: "Spot value" }), _jsx("th", { "aria-label": "Remove" })] }) }), _jsx("tbody", { children: streamItems.data.map((it) => (_jsxs("tr", { children: [_jsx("td", { children: it.sale_type }), _jsx("td", { children: it.sale_type === "sticker" ? it.sticker_code ?? it.name : it.name }), _jsx("td", { children: it.metal }), _jsx("td", { style: { fontSize: "0.7rem" }, children: rawSaleBatchLabel(it, streamBatches.data) }), _jsx("td", { children: Number(it.weight_grams).toFixed(4) }), _jsxs("td", { className: "tbl-green", children: ["$", Number(it.spot_value).toFixed(2)] }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: deleteItemMutation.isPending || endMutation.isPending, onClick: () => {
                                                                if (!window.confirm("Remove this sale from the session?"))
                                                                    return;
                                                                deleteItemMutation.mutate(it.id);
                                                            }, children: "Remove" }) })] }, it.id))) })] }) }))] })] })), _jsxs("p", { style: { fontSize: "0.65rem", color: "var(--muted)", marginTop: "1rem" }, children: ["My stream records: ", streams.data?.length ?? 0] }), activeStreamId ? (_jsx("div", { className: "stream-card-footer", children: _jsx("button", { type: "button", className: "btn btn-outline stream-end-btn", disabled: endMutation.isPending, onClick: requestEnd, children: "End stream" }) })) : null] }));
}
