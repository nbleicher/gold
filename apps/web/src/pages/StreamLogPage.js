import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
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
    const q = useQuery({
        queryKey: ["admin-stream-log"],
        queryFn: () => api("/v1/admin/stream-log")
    });
    const streams = q.data?.streams ?? [];
    const totalItems = streams.reduce((s, st) => s + (st.items?.length ?? 0), 0);
    const totalVal = streams.reduce((s, st) => s + (st.items ?? []).reduce((ss, it) => ss + Number(it.spot_value), 0), 0);
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Stream Log" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "All streaming sessions" }), q.error ? _jsx("p", { className: "error", children: q.error.message }) : null, _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.5rem" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total streams" }), _jsx("div", { className: "stat-val", children: streams.length })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total items sold" }), _jsx("div", { className: "stat-val", children: totalItems })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total spot value" }), _jsxs("div", { className: "stat-val", children: ["$", totalVal.toFixed(0)] })] })] }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Host" }), _jsx("th", { children: "Metal" }), _jsx("th", { children: "Sales mix" }), _jsx("th", { children: "Raw batches" }), _jsx("th", { children: "Items" }), _jsx("th", { children: "Spot value total" }), _jsx("th", { children: "Avg spot" })] }) }), _jsx("tbody", { children: streams.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "tbl-empty", children: "No streams logged yet" }) })) : (streams.map((st) => {
                                const { itemsTotal, metal, avgSpot, mix, rawB, count } = summarizeStream(st);
                                return (_jsxs("tr", { children: [_jsx("td", { children: new Date(st.started_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric"
                                            }) }), _jsx("td", { className: "tbl-gold", children: hostLabel(st) }), _jsx("td", { children: _jsx("span", { className: "badge badge-morning", children: metal }) }), _jsx("td", { style: { fontSize: "0.62rem" }, children: mix }), _jsx("td", { style: { fontSize: "0.58rem", color: "var(--muted)" }, children: rawB }), _jsx("td", { children: count }), _jsxs("td", { className: "tbl-green", children: ["$", itemsTotal.toFixed(2)] }), _jsxs("td", { children: ["$", Number(avgSpot || 0).toFixed(2), "/oz"] })] }, st.id));
                            })) })] }) })] }));
}
