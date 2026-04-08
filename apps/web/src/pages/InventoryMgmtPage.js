import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
export function InventoryMgmtPage() {
    const qc = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [date, setDate] = useState(todayYmd);
    const [metal, setMetal] = useState("gold");
    const [grams, setGrams] = useState("");
    const [spot, setSpot] = useState("");
    const [cost, setCost] = useState("");
    const batches = useQuery({
        queryKey: ["batches"],
        queryFn: () => api("/v1/inventory/batches")
    });
    const createBatch = useMutation({
        mutationFn: () => api("/v1/inventory/batches", {
            method: "POST",
            body: JSON.stringify({
                date,
                metal,
                grams: Number(grams),
                purchaseSpot: Number(spot),
                totalCost: Number(cost)
            })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["batches"] });
            setModalOpen(false);
            setGrams("");
            setSpot("");
            setCost("");
            setDate(todayYmd());
        }
    });
    const patchCode = useMutation({
        mutationFn: ({ id, letter }) => api(`/v1/inventory/batches/${id}/code`, {
            method: "PATCH",
            body: JSON.stringify({ stickerBatchLetter: letter })
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] })
    });
    const deleteBatch = useMutation({
        mutationFn: (id) => api(`/v1/inventory/batches/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] })
    });
    const items = batches.data ?? [];
    const stats = useMemo(() => {
        const totalGrams = items.reduce((s, b) => s + Number(b.grams), 0);
        const totalRem = items.reduce((s, b) => s + Number(b.remaining_grams), 0);
        const totalCost = items.reduce((s, b) => s + Number(b.total_cost), 0);
        return { totalGrams, totalRem, totalCost, count: items.length };
    }, [items]);
    const byDate = useMemo(() => {
        const m = new Map();
        for (const b of items) {
            const list = m.get(b.date) ?? [];
            list.push(b);
            m.set(b.date, list);
        }
        return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }, [items]);
    const onSubmitModal = (e) => {
        e.preventDefault();
        if (!date || !grams || !Number.isFinite(Number(grams)))
            return;
        createBatch.mutate();
    };
    const openModal = () => {
        setDate(todayYmd());
        setModalOpen(true);
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Batch Management" }), _jsx("p", { className: "pg-sub", style: {
                    marginBottom: "1.25rem",
                    fontSize: "0.58rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-dim)"
                }, children: "Metal batches \u00B7 remaining weight after bagging & stream sales" }), batches.error ? _jsx("p", { className: "error", children: batches.error.message }) : null, _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(4, 1fr)" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total batches" }), _jsx("div", { className: "stat-val", children: stats.count })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Purchased (g)" }), _jsxs("div", { className: "stat-val", children: [stats.totalGrams.toFixed(2), _jsx("span", { className: "stat-unit", children: "g" })] })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Remaining (g)" }), _jsxs("div", { className: "stat-val", children: [stats.totalRem.toFixed(2), _jsx("span", { className: "stat-unit", children: "g" })] })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total cost" }), _jsxs("div", { className: "stat-val", children: ["$", stats.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })] })] })] }), _jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }, children: _jsx("button", { type: "button", className: "btn btn-gold", onClick: openModal, children: "+ Add batch" }) }), items.length === 0 ? (_jsx("div", { style: { textAlign: "center", padding: "3rem", color: "var(--muted)", fontSize: "0.7rem" }, children: "No batches yet" })) : (byDate.map(([dateKey, group]) => {
                const groupCost = group.reduce((s, b) => s + Number(b.total_cost), 0);
                const dtLabel = new Date(dateKey + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                });
                return (_jsxs("div", { className: "date-group", style: { marginBottom: "1.5rem" }, children: [_jsxs("div", { className: "date-group-header", children: [_jsx("span", { className: "date-group-label", children: dtLabel }), _jsx("div", { className: "date-line" }), _jsxs("span", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: ["$", groupCost.toFixed(2), " total"] })] }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Batch" }), _jsx("th", { children: "Code" }), _jsx("th", { children: "Metal" }), _jsx("th", { children: "Purchased (g)" }), _jsx("th", { children: "Remaining (g)" }), _jsx("th", { children: "Spot @ buy" }), _jsx("th", { children: "Total cost" }), _jsx("th", {})] }) }), _jsx("tbody", { children: group.map((b) => (_jsxs("tr", { children: [_jsx("td", { className: "tbl-gold", children: b.batch_name ?? "—" }), _jsx("td", { children: _jsx("input", { className: "form-input", style: {
                                                            maxWidth: "3.2rem",
                                                            padding: "0.35rem 0.5rem",
                                                            textAlign: "center",
                                                            textTransform: "uppercase"
                                                        }, maxLength: 1, defaultValue: b.sticker_batch_letter, onBlur: (e) => {
                                                            const L = e.target.value.trim().toUpperCase().slice(0, 1);
                                                            if (!L || L === b.sticker_batch_letter)
                                                                return;
                                                            patchCode.mutate({ id: b.id, letter: L }, {
                                                                onError: (err) => {
                                                                    e.target.value = b.sticker_batch_letter;
                                                                    alert(err instanceof Error ? err.message : "Invalid code");
                                                                }
                                                            });
                                                        } }, `${b.id}-${b.sticker_batch_letter}`) }), _jsx("td", { children: b.metal[0].toUpperCase() + b.metal.slice(1) }), _jsx("td", { children: Number(b.grams).toFixed(4) }), _jsx("td", { className: "tbl-green", children: Number(b.remaining_grams).toFixed(4) }), _jsxs("td", { children: ["$", Number(b.purchase_spot).toFixed(2)] }), _jsxs("td", { className: "tbl-green", children: ["$", Number(b.total_cost).toFixed(2)] }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", onClick: () => {
                                                            if (!confirm("Remove this batch?"))
                                                                return;
                                                            deleteBatch.mutate(b.id, {
                                                                onError: (err) => alert(err instanceof Error ? err.message : "Delete failed")
                                                            });
                                                        }, children: "\u2715" }) })] }, b.id))) })] }) })] }, dateKey));
            })), _jsx("div", { className: `modal-overlay${modalOpen ? " open" : ""}`, role: "presentation", onClick: (e) => e.target === e.currentTarget && setModalOpen(false), children: _jsxs("div", { className: "modal", children: [_jsx("button", { type: "button", className: "modal-close", onClick: () => setModalOpen(false), "aria-label": "Close", children: "\u2715" }), _jsx("div", { className: "modal-title", children: "Add batch \u2014 Batch Management" }), _jsxs("form", { onSubmit: onSubmitModal, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "bm-date", children: "Date" }), _jsx("input", { id: "bm-date", className: "form-input", type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "bm-metal", children: "Metal" }), _jsxs("select", { id: "bm-metal", className: "form-input", value: metal, onChange: (e) => setMetal(e.target.value), children: [_jsx("option", { value: "gold", children: "Gold" }), _jsx("option", { value: "silver", children: "Silver" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "bm-grams", children: "Amount (grams)" }), _jsx("input", { id: "bm-grams", className: "form-input", type: "number", min: 0, step: "0.0001", placeholder: "grams", value: grams, onChange: (e) => setGrams(e.target.value), required: true })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "bm-spot", children: "Spot at purchase ($/oz)" }), _jsx("input", { id: "bm-spot", className: "form-input", type: "number", min: 0, step: "0.01", placeholder: "0.00", value: spot, onChange: (e) => setSpot(e.target.value), required: true })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "bm-cost", children: "Total cost ($)" }), _jsx("input", { id: "bm-cost", className: "form-input", type: "number", min: 0, step: "0.01", placeholder: "0.00", value: cost, onChange: (e) => setCost(e.target.value), required: true })] }), createBatch.error ? _jsx("p", { className: "error", children: createBatch.error.message }) : null, _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setModalOpen(false), children: "Cancel" }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: createBatch.isPending, children: "Save batch" })] })] })] }) })] }));
}
