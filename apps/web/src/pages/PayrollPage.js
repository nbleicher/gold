import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
function parseCsvFile(text, filename) {
    const lines = text.split(/\n/).filter((l) => l.trim());
    if (!lines.length)
        return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
    return { headers, rows };
}
export function PayrollPage() {
    const qc = useQueryClient();
    const [userId, setUserId] = useState("");
    const [preview, setPreview] = useState(null);
    const [drag, setDrag] = useState(false);
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users")
    });
    const payroll = useQuery({
        queryKey: ["admin-payroll"],
        queryFn: () => api("/v1/admin/payroll")
    });
    const importMutation = useMutation({
        mutationFn: () => {
            if (!userId || !preview)
                throw new Error("Select a user and a CSV file");
            return api("/v1/admin/payroll", {
                method: "POST",
                body: JSON.stringify({
                    userId,
                    filename: preview.filename,
                    rows: preview.rows.length
                })
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-payroll"] });
            setPreview(null);
        }
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api(`/v1/admin/payroll/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-payroll"] })
    });
    const onFile = useCallback((file) => {
        if (!file || !file.name.toLowerCase().endsWith(".csv")) {
            alert("Please upload a .csv file");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result ?? "");
            const { headers, rows } = parseCsvFile(text, file.name);
            setPreview({ filename: file.name, headers, rows });
        };
        reader.readAsText(file);
    }, []);
    const userLabel = (u) => u.display_name?.trim() || u.email;
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Payroll" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "Import CSV and assign to a user (metadata only; file content is not stored)" }), users.error || payroll.error ? (_jsx("p", { className: "error", children: String((users.error ?? payroll.error)) })) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "IMPORT PAYROLL CSV" }), _jsxs("div", { className: "form-group", style: { maxWidth: 280 }, children: [_jsx("label", { className: "form-label", htmlFor: "pr-user", children: "Assign to user" }), _jsxs("select", { id: "pr-user", className: "form-input", value: userId, onChange: (e) => setUserId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Select user \u2014" }), (users.data ?? []).map((u) => (_jsx("option", { value: u.id, children: userLabel(u) }, u.id)))] })] }), _jsxs("div", { className: `upload-zone${drag ? " drag" : ""}`, onClick: () => document.getElementById("csv-input")?.click(), onDragOver: (e) => {
                            e.preventDefault();
                            setDrag(true);
                        }, onDragLeave: () => setDrag(false), onDrop: (e) => {
                            e.preventDefault();
                            setDrag(false);
                            const f = e.dataTransfer.files[0];
                            if (f)
                                onFile(f);
                        }, children: [_jsx("div", { className: "upload-icon", children: "\uD83D\uDCC4" }), _jsx("div", { className: "upload-text", children: "Click to upload CSV file" }), _jsx("div", { className: "upload-hint", children: "Columns are auto-detected from the first row" })] }), _jsx("input", { id: "csv-input", type: "file", accept: ".csv", style: { display: "none" }, onChange: (e) => onFile(e.target.files?.[0] ?? null) }), preview && preview.headers.length ? (_jsxs("div", { style: { marginTop: "1rem" }, children: [_jsxs("div", { style: { fontSize: "0.6rem", color: "var(--muted)", marginBottom: "0.5rem" }, children: ["PREVIEW \u2014 ", preview.filename, " \u2014 ", preview.rows.length, " rows"] }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsx("tr", { children: preview.headers.map((h) => (_jsx("th", { children: h }, h))) }) }), _jsx("tbody", { children: preview.rows.slice(0, 8).map((r, i) => (_jsx("tr", { children: r.map((c, j) => (_jsx("td", { children: c }, j))) }, i))) })] }) }), preview.rows.length > 8 ? (_jsxs("div", { style: { fontSize: "0.6rem", color: "var(--muted)", padding: "0.5rem 0" }, children: ["\u2026and ", preview.rows.length - 8, " more rows"] })) : null, _jsxs("div", { style: { display: "flex", gap: "0.75rem", marginTop: "1rem" }, children: [_jsx("button", { type: "button", className: "btn btn-gold", disabled: importMutation.isPending, onClick: () => importMutation.mutate(), children: "\u2713 Import this CSV" }), _jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setPreview(null), children: "Cancel" })] }), importMutation.error ? (_jsx("p", { className: "error", style: { marginTop: "0.75rem" }, children: importMutation.error.message })) : null] })) : null] }), _jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "PAYROLL RECORDS" }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date imported" }), _jsx("th", { children: "User" }), _jsx("th", { children: "Rows" }), _jsx("th", { children: "File" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (payroll.data ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "tbl-empty", children: "No payroll records" }) })) : ((payroll.data ?? []).map((r) => (_jsxs("tr", { children: [_jsx("td", { children: new Date(r.imported_at).toLocaleDateString() }), _jsx("td", { className: "tbl-gold", children: r.display_name?.trim() || r.email }), _jsx("td", { children: r.rows }), _jsx("td", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: r.filename }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", onClick: () => {
                                                if (confirm("Delete this payroll record?"))
                                                    deleteMutation.mutate(r.id);
                                            }, children: "\u2715" }) })] }, r.id)))) })] }) })] }));
}
