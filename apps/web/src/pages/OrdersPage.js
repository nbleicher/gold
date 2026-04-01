import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getTierIndex } from "../lib/tiers";
function batchLabel(order, batches) {
    const comps = order.bag_order_components ?? [];
    if (!comps.length)
        return "—";
    return comps
        .map((c) => {
        const bx = batches.find((b) => b.id === c.batch_id);
        const name = bx?.batch_name ?? "—";
        return `${name} (${Number(c.weight_grams).toFixed(4)}g)`;
    })
        .join(" + ");
}
export function OrdersPage() {
    const qc = useQueryClient();
    const [metal, setMetal] = useState("gold");
    const [primaryBatchId, setPrimaryBatchId] = useState("");
    const [primaryWeight, setPrimaryWeight] = useState("0.0000");
    const [mixed, setMixed] = useState(false);
    const [secondBatchId, setSecondBatchId] = useState("");
    const [secondWeight, setSecondWeight] = useState("0.0000");
    const batches = useQuery({
        queryKey: ["batches"],
        queryFn: () => api("/v1/inventory/batches")
    });
    const bagOrders = useQuery({
        queryKey: ["bag-orders"],
        queryFn: () => api("/v1/bag-orders")
    });
    const secondMetal = metal === "gold" ? "silver" : "gold";
    const primaryChoices = useMemo(() => (batches.data ?? []).filter((b) => b.metal === metal && Number(b.remaining_grams) > 0), [batches.data, metal]);
    const secondChoices = useMemo(() => (batches.data ?? []).filter((b) => b.metal === secondMetal && Number(b.remaining_grams) > 0), [batches.data, secondMetal]);
    const tierPreview = useMemo(() => {
        const w = Number(primaryWeight) || 0;
        const w2 = mixed ? Number(secondWeight) || 0 : 0;
        const total = w + w2;
        if (!(total > 0))
            return "Enter weight to preview tier.";
        const t = getTierIndex(total);
        if (t == null)
            return "Weight outside configured tiers.";
        return `Matched tier index: ${t} (total ${total.toFixed(4)} g${mixed ? `, primary ${w.toFixed(4)} g + second ${w2.toFixed(4)} g` : ""})`;
    }, [primaryWeight, secondWeight, mixed]);
    const createBag = useMutation({
        mutationFn: () => {
            const primary = (batches.data ?? []).find((b) => b.id === primaryBatchId);
            if (!primary)
                throw new Error("Select primary batch");
            const secondary = (batches.data ?? []).find((b) => b.id === secondBatchId);
            return api("/v1/bag-orders", {
                method: "POST",
                body: JSON.stringify({
                    primaryBatchId,
                    primaryMetal: primary.metal,
                    primaryWeightGrams: Number(primaryWeight),
                    secondBatchId: mixed ? secondBatchId : undefined,
                    secondMetal: mixed && secondary ? secondary.metal : undefined,
                    secondWeightGrams: mixed ? Number(secondWeight) : undefined
                })
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["batches"] });
            qc.invalidateQueries({ queryKey: ["bag-orders"] });
            setPrimaryWeight("0.0000");
            setSecondWeight("0.0000");
        }
    });
    const markSold = useMutation({
        mutationFn: (id) => api(`/v1/bag-orders/${id}/mark-sold`, { method: "PATCH" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["bag-orders"] })
    });
    const onSubmit = (e) => {
        e.preventDefault();
        createBag.mutate();
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Inventory Management" }), _jsx("p", { className: "pg-sub", style: {
                    marginBottom: "1.25rem",
                    fontSize: "0.58rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--text-dim)"
                }, children: "Bag from a batch \u00B7 weight sets tier \u00B7 sticker code auto-assigned" }), batches.error || bagOrders.error ? (_jsx("p", { className: "error", children: String((batches.error ?? bagOrders.error)) })) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "NEW BAG" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "grid-form", style: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 120 }, children: [_jsx("label", { className: "form-label", children: "Metal" }), _jsxs("select", { className: "form-input", value: metal, onChange: (e) => {
                                                    setMetal(e.target.value);
                                                    setPrimaryBatchId("");
                                                    setSecondBatchId("");
                                                }, children: [_jsx("option", { value: "gold", children: "Gold" }), _jsx("option", { value: "silver", children: "Silver" })] })] }), _jsxs("div", { className: "form-group", style: { flex: "2 1 200px", minWidth: 200 }, children: [_jsx("label", { className: "form-label", children: "Batch" }), _jsxs("select", { className: "form-input", value: primaryBatchId, onChange: (e) => setPrimaryBatchId(e.target.value), children: [_jsx("option", { value: "", children: primaryChoices.length ? "Select batch" : `No ${metal} batches with stock` }), primaryChoices.map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name ?? b.id, " \u00B7 ", Number(b.remaining_grams).toFixed(4), "g left"] }, b.id)))] })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", children: "Weight (g)" }), _jsx("input", { className: "form-input", type: "number", min: 0, step: "0.0001", placeholder: "0.0000", value: primaryWeight, onChange: (e) => setPrimaryWeight(e.target.value) })] }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: createBag.isPending, style: { alignSelf: "flex-end" }, children: "Create sticker" })] }), _jsxs("label", { style: {
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    fontSize: "0.68rem",
                                    color: "var(--text-dim)",
                                    marginTop: "0.75rem"
                                }, children: [_jsx("input", { type: "checkbox", checked: mixed, onChange: (e) => setMixed(e.target.checked) }), "Add second metal to same bag (gold + silver)"] }), mixed ? (_jsxs("div", { className: "grid-form", style: { marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 180 }, children: [_jsx("label", { className: "form-label", children: "Second metal batch" }), _jsxs("select", { className: "form-input", value: secondBatchId, onChange: (e) => setSecondBatchId(e.target.value), children: [_jsx("option", { value: "", children: secondChoices.length ? "Select batch" : `No ${secondMetal} batches with stock` }), secondChoices.map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name ?? b.id, " \u00B7 ", Number(b.remaining_grams).toFixed(4), "g left"] }, b.id)))] })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", children: "Second metal weight (g)" }), _jsx("input", { className: "form-input", type: "number", min: 0, step: "0.0001", placeholder: "0.0000", value: secondWeight, onChange: (e) => setSecondWeight(e.target.value) })] })] })) : null, _jsx("p", { style: { fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.55rem" }, children: tierPreview }), createBag.error ? _jsx("p", { className: "error", children: createBag.error.message }) : null] })] }), _jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "RECENT BAGS" }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Sticker" }), _jsx("th", { children: "Batch" }), _jsx("th", { children: "Metal" }), _jsx("th", { children: "Weight (g)" }), _jsx("th", { children: "Tier" }), _jsx("th", { children: "Created" }), _jsx("th", { children: "Status" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (bagOrders.data ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "tbl-empty", children: "No bag orders yet" }) })) : ((bagOrders.data ?? []).map((o) => (_jsxs("tr", { children: [_jsx("td", { className: "tbl-gold", children: o.sticker_code }), _jsx("td", { children: batchLabel(o, batches.data ?? []) }), _jsx("td", { children: o.metal[0].toUpperCase() + o.metal.slice(1) }), _jsx("td", { children: Number(o.actual_weight_grams).toFixed(4) }), _jsx("td", { children: o.tier_index }), _jsx("td", { style: { fontSize: "0.62rem", color: "var(--muted)" }, children: new Date(o.created_at).toLocaleString() }), _jsx("td", { children: o.sold ? (_jsx("span", { className: "badge badge-evening", children: "Sold" })) : (_jsx("span", { className: "badge badge-morning", children: "Open" })) }), _jsx("td", { children: !o.sold ? (_jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: markSold.isPending, onClick: () => markSold.mutate(o.id), children: "Mark sold" })) : null })] }, o.id)))) })] }) })] }));
}
