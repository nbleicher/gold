import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
function hostLabel(s) {
    return s.user_display_name?.trim() || s.user_email || "—";
}
function summarizeStream(st) {
    const its = st.items ?? [];
    const itemsTotal = its.reduce((sum, i) => sum + Number(i.spot_value), 0);
    const metals = [...new Set(its.map((i) => i.metal || "gold"))];
    const metal = metals.length > 1 ? "mixed" : metals[0] || "gold";
    const avgSpot = its.length ? its.reduce((sum, i) => sum + Number(i.spot_price), 0) / its.length : 0;
    const stN = its.filter((i) => i.sale_type === "sticker").length;
    const rw = its.filter((i) => i.sale_type === "raw").length;
    const leg = its.length - stN - rw;
    const mix = leg > 0 ? `${stN} sticker · ${rw} raw · ${leg} other` : `${stN} sticker · ${rw} raw`;
    const rawB = `G: ${st.gold_batch_name} · S: ${st.silver_batch_name}`;
    return { itemsTotal, metal, avgSpot, mix, rawB, count: its.length };
}
export function StreamLogPage() {
    const qc = useQueryClient();
    const [expanded, setExpanded] = useState(() => new Set());
    const [earningsEditingId, setEarningsEditingId] = useState(null);
    const [earningsDraft, setEarningsDraft] = useState("");
    const toggleExpanded = (streamId) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(streamId))
                next.delete(streamId);
            else
                next.add(streamId);
            return next;
        });
    };
    const q = useQuery({
        queryKey: ["admin-stream-log"],
        queryFn: () => api("/v1/admin/stream-log")
    });
    const deleteMutation = useMutation({
        mutationFn: (streamId) => api(`/v1/admin/streams/${streamId}`, { method: "DELETE" }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
        }
    });
    const deleteItemMutation = useMutation({
        mutationFn: (itemId) => api(`/v1/streams/items/${itemId}`, { method: "DELETE" }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
            void qc.invalidateQueries({ queryKey: ["streams"] });
            void qc.invalidateQueries({ queryKey: ["batches"] });
            void qc.invalidateQueries({ queryKey: ["bag-orders"] });
        }
    });
    const completedEarningsMutation = useMutation({
        mutationFn: ({ streamId, completedEarnings }) => api(`/v1/admin/streams/${streamId}/completed-earnings`, {
            method: "PATCH",
            body: JSON.stringify({ completedEarnings })
        }),
        onSuccess: () => {
            setEarningsEditingId(null);
            setEarningsDraft("");
            void qc.invalidateQueries({ queryKey: ["admin-stream-log"] });
        }
    });
    const requestDelete = (st) => {
        const ok = window.confirm("Delete this stream session and all logged sales? Raw metal will be returned to batches and sticker bags will be marked unsold.");
        if (!ok)
            return;
        deleteMutation.mutate(st.id);
    };
    const streams = q.data?.streams ?? [];
    const totalItems = streams.reduce((s, st) => s + (st.items?.length ?? 0), 0);
    const totalVal = streams.reduce((s, st) => s + (st.items ?? []).reduce((ss, it) => ss + Number(it.spot_value), 0), 0);
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Stream Log" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "All streaming sessions" }), q.error ? _jsx("p", { className: "error", children: q.error.message }) : null, deleteMutation.error ? (_jsx("p", { className: "error", children: deleteMutation.error.message })) : null, deleteItemMutation.error ? (_jsx("p", { className: "error", children: deleteItemMutation.error.message })) : null, completedEarningsMutation.error ? (_jsx("p", { className: "error", children: completedEarningsMutation.error.message })) : null, _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.5rem" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total streams" }), _jsx("div", { className: "stat-val", children: streams.length })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total items sold" }), _jsx("div", { className: "stat-val", children: totalItems })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total Cost" }), _jsxs("div", { className: "stat-val", children: ["$", totalVal.toFixed(0)] })] })] }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { "aria-label": "Expand" }), _jsx("th", { children: "Date" }), _jsx("th", { children: "Host" }), _jsx("th", { children: "Metal" }), _jsx("th", { children: "Sales mix" }), _jsx("th", { children: "Raw batches" }), _jsx("th", { children: "Items sold" }), _jsx("th", { children: "Total Cost" }), _jsx("th", { children: "Avg spot" }), _jsx("th", { children: "Completed earnings" }), _jsx("th", { "aria-label": "Actions" })] }) }), _jsx("tbody", { children: streams.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 11, className: "tbl-empty", children: "No streams logged yet" }) })) : (streams.flatMap((st) => {
                                const { itemsTotal, metal, avgSpot, mix, rawB, count } = summarizeStream(st);
                                const isOpen = expanded.has(st.id);
                                const items = st.items ?? [];
                                const mainRow = (_jsxs("tr", { children: [_jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-outline btn-sm", "aria-expanded": isOpen, onClick: () => toggleExpanded(st.id), style: { padding: "0.15rem 0.45rem", minWidth: "2rem" }, children: isOpen ? "−" : "+" }) }), _jsx("td", { children: new Date(st.started_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric"
                                            }) }), _jsx("td", { className: "tbl-gold", children: hostLabel(st) }), _jsx("td", { children: _jsx("span", { className: "badge badge-morning", children: metal }) }), _jsx("td", { style: { fontSize: "0.62rem" }, children: mix }), _jsx("td", { style: { fontSize: "0.58rem", color: "var(--muted)" }, children: rawB }), _jsx("td", { children: count }), _jsxs("td", { className: "tbl-green", children: ["$", itemsTotal.toFixed(2)] }), _jsxs("td", { children: ["$", Number(avgSpot || 0).toFixed(2), "/oz"] }), _jsx("td", { style: { fontSize: "0.62rem", verticalAlign: "top" }, children: earningsEditingId === st.id ? (_jsxs("div", { style: {
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "0.35rem",
                                                    minWidth: "7.5rem"
                                                }, children: [_jsx("input", { type: "number", min: 0, step: 0.01, value: earningsDraft, onChange: (e) => setEarningsDraft(e.target.value), disabled: completedEarningsMutation.isPending, style: { maxWidth: "9rem" } }), _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.35rem" }, children: [_jsx("button", { type: "button", className: "btn btn-gold btn-sm", disabled: completedEarningsMutation.isPending, onClick: () => {
                                                                    const n = Number(earningsDraft);
                                                                    if (!Number.isFinite(n) || n < 0)
                                                                        return;
                                                                    completedEarningsMutation.mutate({
                                                                        streamId: st.id,
                                                                        completedEarnings: n
                                                                    });
                                                                }, children: "Save" }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: completedEarningsMutation.isPending, onClick: () => {
                                                                    setEarningsEditingId(null);
                                                                    setEarningsDraft("");
                                                                }, children: "Cancel" })] })] })) : st.completed_earnings != null ? (_jsxs("div", { children: [_jsxs("div", { children: ["Completed earnings: $", Number(st.completed_earnings).toFixed(2)] }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", style: { marginTop: "0.35rem" }, onClick: () => {
                                                            setEarningsEditingId(st.id);
                                                            setEarningsDraft(String(st.completed_earnings));
                                                        }, children: "Edit" })] })) : (_jsx("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => {
                                                    setEarningsEditingId(st.id);
                                                    setEarningsDraft("");
                                                }, children: "Add Completed Earnings" })) }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: deleteMutation.isPending, onClick: () => requestDelete(st), children: "Delete" }) })] }, st.id));
                                if (!isOpen)
                                    return [mainRow];
                                const detailRow = (_jsx("tr", { children: _jsxs("td", { colSpan: 11, style: { background: "var(--slate)", padding: "0.75rem 1rem" }, children: [_jsx("div", { style: { fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.5rem" }, children: "Session line items \u2014 remove to reverse inventory / unsell sticker" }), items.length === 0 ? (_jsx("span", { style: { fontSize: "0.7rem", color: "var(--muted)" }, children: "No items" })) : (_jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Type" }), _jsx("th", { children: "Sticker / name" }), _jsx("th", { children: "Metal" }), _jsx("th", { children: "Weight (g)" }), _jsx("th", { children: "Spot value" }), _jsx("th", { "aria-label": "Remove" })] }) }), _jsx("tbody", { children: items.map((it) => (_jsxs("tr", { children: [_jsx("td", { children: it.sale_type }), _jsx("td", { children: it.sale_type === "sticker" ? it.sticker_code ?? it.name : it.name }), _jsx("td", { children: it.metal }), _jsx("td", { children: Number(it.weight_grams).toFixed(4) }), _jsxs("td", { className: "tbl-green", children: ["$", Number(it.spot_value).toFixed(2)] }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: deleteItemMutation.isPending, onClick: () => {
                                                                                if (!window.confirm("Remove this sale and reverse stock / sticker status?"))
                                                                                    return;
                                                                                deleteItemMutation.mutate(it.id);
                                                                            }, children: "Remove" }) })] }, it.id))) })] }) }))] }) }, `${st.id}-detail`));
                                return [mainRow, detailRow];
                            })) })] }) })] }));
}
