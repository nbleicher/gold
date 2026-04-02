import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
function fmtMoney(n) {
    return `$${n.toFixed(2)}`;
}
function spotStatusClass(state) {
    if (state === "primary")
        return "spot-status primary";
    if (state === "fallback")
        return "spot-status fallback";
    return "spot-status offline";
}
export function DashboardPage() {
    const home = useQuery({
        queryKey: ["dashboard-home"],
        queryFn: () => api("/v1/dashboard/home")
    });
    const spot = useQuery({
        queryKey: ["spot-latest"],
        queryFn: () => api("/v1/spot/latest")
    });
    const last = home.data?.lastStream ?? null;
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { className: "pg-title", children: "Home" }), _jsx("p", { className: "pg-sub", children: "Streams, last session margin, live spot" }), spot.isSuccess ? (_jsxs("div", { className: "spot-ticker", children: [_jsxs("div", { className: "spot-card active", children: [_jsx("div", { className: "spot-label", children: "Gold" }), _jsxs("div", { className: "spot-price", children: [fmtMoney(Number(spot.data.gold.price)), _jsx("span", { className: "spot-unit", children: "/oz" })] }), _jsxs("div", { className: "spot-live-text", style: { marginTop: "0.35rem" }, children: [_jsx("span", { className: spotStatusClass(spot.data.gold.source_state), children: spot.data.gold.source_state }), _jsx("span", { style: { marginLeft: "0.5rem", color: "var(--muted)" }, children: new Date(spot.data.gold.created_at).toLocaleString() })] })] }), _jsxs("div", { className: "spot-card", children: [_jsx("div", { className: "spot-label", children: "Silver" }), _jsxs("div", { className: "spot-price", children: [fmtMoney(Number(spot.data.silver.price)), _jsx("span", { className: "spot-unit", children: "/oz" })] }), _jsxs("div", { className: "spot-live-text", style: { marginTop: "0.35rem" }, children: [_jsx("span", { className: spotStatusClass(spot.data.silver.source_state), children: spot.data.silver.source_state }), _jsx("span", { style: { marginLeft: "0.5rem", color: "var(--muted)" }, children: new Date(spot.data.silver.created_at).toLocaleString() })] })] })] })) : spot.isError ? (_jsx("p", { className: "error", style: { marginBottom: "1rem" }, children: spot.error.message })) : spot.isLoading ? (_jsx("p", { style: { fontSize: "0.65rem", color: "var(--muted)", marginBottom: "1rem" }, children: "Loading spot\u2026" })) : null, home.error ? _jsx("p", { className: "error", children: home.error.message }) : null, _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "0.5rem" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Streams today (UTC)" }), _jsx("div", { className: "stat-val", children: home.isLoading ? "—" : (home.data?.streamsToday ?? 0) })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Last stream \u00B7 est. profit" }), _jsx("div", { className: "stat-val", style: { fontSize: "1.35rem" }, children: home.isLoading ? "—" : last ? fmtMoney(last.estimatedProfit) : "—" })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Last stream \u00B7 profit / min" }), _jsx("div", { className: "stat-val", style: { fontSize: "1.35rem" }, children: home.isLoading ? "—" : last ? fmtMoney(last.profitPerMinute) : "—" })] })] }), _jsx("p", { style: { fontSize: "0.58rem", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.5 }, children: "Estimated profit uses batch cost (total cost \u00F7 original grams \u00D7 sold grams). Sticker sales use the linked batch only; mixed bags can skew margin. \"Today\" uses the database calendar day (UTC)." }), last ? (_jsxs("div", { style: {
                    fontSize: "0.65rem",
                    color: "var(--text-dim)",
                    borderTop: "1px solid var(--border)",
                    paddingTop: "1rem"
                }, children: [_jsxs("div", { children: [_jsx("strong", { children: "Last stream" }), " \u00B7 ", new Date(last.startedAt).toLocaleString(), last.endedAt ? ` → ${new Date(last.endedAt).toLocaleString()}` : " · live"] }), _jsxs("div", { style: { marginTop: "0.35rem" }, children: [last.itemCount, " sale", last.itemCount === 1 ? "" : "s", " \u00B7 spot value ", fmtMoney(last.totalSpotValue), " ", "\u00B7 ~", last.durationMinutes.toFixed(1), " min"] })] })) : !home.isLoading && home.data ? (_jsx("p", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: "No streams yet for this account." })) : null] }));
}
