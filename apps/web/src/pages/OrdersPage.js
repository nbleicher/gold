import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
export function OrdersPage() {
    const qc = useQueryClient();
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
        }
    });
    const deleteBag = useMutation({
        mutationFn: (id) => api(`/v1/bag-orders/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["batches"] });
            qc.invalidateQueries({ queryKey: ["bag-orders"] });
        }
    });
    const primaryBatch = useMemo(() => (batches.data ?? []).find((b) => b.id === primaryBatchId), [batches.data, primaryBatchId]);
    const secondaryChoices = useMemo(() => (batches.data ?? []).filter((b) => b.metal !== primaryBatch?.metal), [batches.data, primaryBatch?.metal]);
    const onSubmit = (e) => {
        e.preventDefault();
        createBag.mutate();
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Orders" }), _jsxs("form", { className: "grid-form", onSubmit: onSubmit, children: [_jsxs("select", { value: primaryBatchId, onChange: (e) => setPrimaryBatchId(e.target.value), children: [_jsx("option", { value: "", children: "Primary batch" }), (batches.data ?? []).map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name, " (", b.metal, ") \u00B7 ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id)))] }), _jsx("input", { value: primaryWeight, onChange: (e) => setPrimaryWeight(e.target.value), placeholder: "primary grams" }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: mixed, onChange: (e) => setMixed(e.target.checked) }), " Mixed bag"] }), mixed ? (_jsxs(_Fragment, { children: [_jsxs("select", { value: secondBatchId, onChange: (e) => setSecondBatchId(e.target.value), children: [_jsx("option", { value: "", children: "Second batch" }), secondaryChoices.map((b) => (_jsxs("option", { value: b.id, children: [b.batch_name, " (", b.metal, ") \u00B7 ", Number(b.remaining_grams).toFixed(4), "g"] }, b.id)))] }), _jsx("input", { value: secondWeight, onChange: (e) => setSecondWeight(e.target.value), placeholder: "second grams" })] })) : null, _jsx("button", { type: "submit", disabled: createBag.isPending, children: "Create sticker" })] }), _jsxs("p", { children: ["Batches available: ", batches.data?.length ?? 0] }), _jsxs("p", { children: ["Bag orders: ", bagOrders.data?.length ?? 0] }), _jsx("ul", { children: (bagOrders.data ?? []).slice(0, 30).map((o) => (_jsxs("li", { children: [o.sticker_code, " \u00B7 ", o.metal, " \u00B7 ", Number(o.actual_weight_grams).toFixed(4), "g \u00B7 tier ", o.tier_index, " ", _jsx("button", { onClick: () => deleteBag.mutate(o.id), children: "delete" })] }, o.id))) })] }));
}
