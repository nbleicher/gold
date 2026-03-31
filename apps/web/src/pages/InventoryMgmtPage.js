import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
export function InventoryMgmtPage() {
    const qc = useQueryClient();
    const [date, setDate] = useState("");
    const [metal, setMetal] = useState("gold");
    const [grams, setGrams] = useState("0.0000");
    const [spot, setSpot] = useState("0");
    const [cost, setCost] = useState("0");
    const batches = useQuery({
        queryKey: ["inventory-batches"],
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
            qc.invalidateQueries({ queryKey: ["inventory-batches"] });
        }
    });
    const onSubmit = (e) => {
        e.preventDefault();
        createBatch.mutate();
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Inventory Management (Batches)" }), _jsxs("form", { className: "grid-form", onSubmit: onSubmit, children: [_jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), required: true }), _jsxs("select", { value: metal, onChange: (e) => setMetal(e.target.value), children: [_jsx("option", { value: "gold", children: "Gold" }), _jsx("option", { value: "silver", children: "Silver" })] }), _jsx("input", { value: grams, onChange: (e) => setGrams(e.target.value), placeholder: "grams" }), _jsx("input", { value: spot, onChange: (e) => setSpot(e.target.value), placeholder: "spot" }), _jsx("input", { value: cost, onChange: (e) => setCost(e.target.value), placeholder: "cost" }), _jsx("button", { type: "submit", disabled: createBatch.isPending, children: "Add batch" })] }), _jsx("ul", { children: (batches.data ?? []).slice(0, 50).map((b) => (_jsxs("li", { children: [b.date, " \u00B7 ", b.metal, " \u00B7 purchased ", Number(b.grams).toFixed(4), "g \u00B7 remaining", " ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id))) })] }));
}
