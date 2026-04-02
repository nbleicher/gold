import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
export function ExpensesPage() {
    const qc = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [date, setDate] = useState(todayYmd);
    const [name, setName] = useState("");
    const [cost, setCost] = useState("");
    const list = useQuery({
        queryKey: ["admin-expenses"],
        queryFn: () => api("/v1/admin/expenses")
    });
    const create = useMutation({
        mutationFn: () => api("/v1/admin/expenses", {
            method: "POST",
            body: JSON.stringify({
                date,
                name: name.trim(),
                cost: Number(cost)
            })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-expenses"] });
            setModalOpen(false);
            setName("");
            setCost("");
            setDate(todayYmd());
        }
    });
    const remove = useMutation({
        mutationFn: (id) => api(`/v1/admin/expenses/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-expenses"] })
    });
    const items = list.data ?? [];
    const totalCost = items.reduce((s, i) => s + Number(i.cost), 0);
    const onSubmit = (e) => {
        e.preventDefault();
        if (!name.trim() || !Number.isFinite(Number(cost)) || Number(cost) < 0)
            return;
        create.mutate();
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Supplies" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "Track supply purchases by date" }), list.error ? _jsx("p", { className: "error", children: list.error.message }) : null, _jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(2, 1fr)" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total line items" }), _jsx("div", { className: "stat-val", children: items.length })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total cost" }), _jsxs("div", { className: "stat-val", children: ["$", totalCost.toFixed(2)] })] })] }), _jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }, children: _jsx("button", { type: "button", className: "btn btn-gold", onClick: () => setModalOpen(true), children: "+ Add supply" }) }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date" }), _jsx("th", { children: "Description" }), _jsx("th", { children: "Cost" }), _jsx("th", {})] }) }), _jsx("tbody", { children: items.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "tbl-empty", children: "No supplies recorded" }) })) : (items.map((i) => (_jsxs("tr", { children: [_jsx("td", { children: new Date(i.date + "T12:00:00").toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric"
                                        }) }), _jsx("td", { className: "tbl-gold", children: i.name }), _jsxs("td", { className: "tbl-green", children: ["$", Number(i.cost).toFixed(2)] }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", onClick: () => {
                                                if (confirm("Remove this supply entry?"))
                                                    remove.mutate(i.id);
                                            }, children: "\u2715" }) })] }, i.id)))) })] }) }), _jsx("div", { className: `modal-overlay${modalOpen ? " open" : ""}`, role: "presentation", onClick: (e) => e.target === e.currentTarget && setModalOpen(false), children: _jsxs("div", { className: "modal", children: [_jsx("button", { type: "button", className: "modal-close", onClick: () => setModalOpen(false), "aria-label": "Close", children: "\u2715" }), _jsx("div", { className: "modal-title", children: "Add supply" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "ex-date", children: "Date" }), _jsx("input", { id: "ex-date", className: "form-input", type: "date", value: date, onChange: (e) => setDate(e.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "ex-name", children: "Description" }), _jsx("input", { id: "ex-name", className: "form-input", value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Shipping supplies" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "ex-cost", children: "Cost (USD)" }), _jsx("input", { id: "ex-cost", className: "form-input", type: "number", min: 0, step: "0.01", value: cost, onChange: (e) => setCost(e.target.value) })] }), create.error ? _jsx("p", { className: "error", children: create.error.message }) : null, _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setModalOpen(false), children: "Cancel" }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: create.isPending, children: "Save" })] })] })] }) })] }));
}
