import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
function money(value) {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function AdminDashboardPage() {
    const expenses = useQuery({
        queryKey: ["admin-expenses"],
        queryFn: () => api("/v1/admin/expenses")
    });
    const batches = useQuery({
        queryKey: ["batches"],
        queryFn: () => api("/v1/inventory/batches")
    });
    const bagOrders = useQuery({
        queryKey: ["bag-orders"],
        queryFn: () => api("/v1/bag-orders")
    });
    const metrics = useMemo(() => {
        const supplyTotalCost = (expenses.data ?? []).reduce((sum, item) => sum + Number(item.cost), 0);
        const batchTotalCost = (batches.data ?? []).reduce((sum, item) => sum + Number(item.total_cost), 0);
        const totalBatchGrams = (batches.data ?? []).reduce((sum, item) => sum + Number(item.grams), 0);
        const totalBatchRemaining = (batches.data ?? []).reduce((sum, item) => sum + Number(item.remaining_grams), 0);
        const batchRemainingPct = totalBatchGrams > 0 ? (totalBatchRemaining / totalBatchGrams) * 100 : 0;
        const totalBags = (bagOrders.data ?? []).length;
        const totalCost = supplyTotalCost + batchTotalCost;
        return {
            supplyTotalCost,
            batchTotalCost,
            batchRemainingPct,
            totalBags,
            totalCost
        };
    }, [expenses.data, batches.data, bagOrders.data]);
    const error = expenses.error ?? batches.error ?? bagOrders.error;
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Admin Dashboard" }), error ? _jsx("p", { className: "error", children: String(error) }) : null, _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "0.75rem" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Supplies total cost" }), _jsx("div", { className: "stat-val", children: money(metrics.supplyTotalCost) })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Batch Management" }), _jsxs("div", { className: "stat-val", children: [metrics.batchRemainingPct.toFixed(2), "%"] }), _jsxs("div", { style: { fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }, children: [money(metrics.batchTotalCost), " total cost"] })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Inventory Management" }), _jsx("div", { className: "stat-val", children: metrics.totalBags }), _jsx("div", { style: { fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }, children: "Total bags" })] })] }), _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(3, 1fr)" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total cost" }), _jsx("div", { className: "stat-val", children: money(metrics.totalCost) }), _jsx("div", { style: { fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }, children: "Supplies + Batch Management" })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Gross profit" }), _jsx("div", { className: "stat-val", style: { fontSize: "1.2rem" }, children: "Coming soon" })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Net profit" }), _jsx("div", { className: "stat-val", style: { fontSize: "1.2rem" }, children: "Coming soon" })] })] })] }));
}
