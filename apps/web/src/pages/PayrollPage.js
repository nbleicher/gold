import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
/** Set to true to show CSV import UI again. */
const PAYROLL_CSV_IMPORT_ENABLED = false;
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
    const [commissionUserId, setCommissionUserId] = useState("");
    const [commissionStart, setCommissionStart] = useState("");
    const [commissionEnd, setCommissionEnd] = useState("");
    const [commissionParams, setCommissionParams] = useState(null);
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users")
    });
    const commissionPreview = useQuery({
        queryKey: ["payroll-commission-preview", commissionParams],
        queryFn: () => {
            const p = commissionParams;
            const qs = new URLSearchParams({ userId: p.userId, start: p.start, end: p.end });
            return api(`/v1/admin/payroll/commission-preview?${qs.toString()}`);
        },
        enabled: commissionParams !== null
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
    const selectedCommissionUser = useMemo(() => (users.data ?? []).find((u) => u.id === commissionUserId), [users.data, commissionUserId]);
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Payroll" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "Commission calculator from stream net profit" }), users.error || payroll.error ? (_jsx("p", { className: "error", children: String((users.error ?? payroll.error)) })) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "COMMISSION PAYROLL" }), _jsxs("p", { style: { fontSize: "0.65rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.45 }, children: ["Streams whose ", _jsx("strong", { children: "started at" }), " date falls in the range (inclusive). Net per stream is completed earnings minus COGS; streams without completed earnings count as $0 net and are flagged below."] }), _jsxs("div", { className: "grid-form", style: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 200 }, children: [_jsx("label", { className: "form-label", htmlFor: "pc-user", children: "User" }), _jsxs("select", { id: "pc-user", className: "form-input", value: commissionUserId, onChange: (e) => setCommissionUserId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Select user \u2014" }), (users.data ?? []).map((u) => (_jsx("option", { value: u.id, children: userLabel(u) }, u.id)))] })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", htmlFor: "pc-start", children: "Start (YYYY-MM-DD)" }), _jsx("input", { id: "pc-start", className: "form-input", type: "date", value: commissionStart, onChange: (e) => setCommissionStart(e.target.value) })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", htmlFor: "pc-end", children: "End (YYYY-MM-DD)" }), _jsx("input", { id: "pc-end", className: "form-input", type: "date", value: commissionEnd, onChange: (e) => setCommissionEnd(e.target.value) })] }), _jsx("button", { type: "button", className: "btn btn-gold", disabled: !commissionUserId || !commissionStart || !commissionEnd || commissionPreview.isFetching, onClick: () => setCommissionParams({
                                    userId: commissionUserId,
                                    start: commissionStart,
                                    end: commissionEnd
                                }), children: "Calculate" })] }), selectedCommissionUser ? (_jsxs("div", { style: { fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.75rem" }, children: ["Commission rate:", " ", _jsxs("strong", { style: { color: "var(--gold)" }, children: [Number(selectedCommissionUser.commission_percent ?? 0).toFixed(1), "%"] }), " ", "(edit under Users)"] })) : null, commissionPreview.error ? (_jsx("p", { className: "error", style: { marginTop: "0.75rem" }, children: commissionPreview.error.message })) : null, commissionPreview.data ? (_jsxs("div", { style: { marginTop: "1rem" }, children: [_jsxs("div", { className: "stats-row", style: { gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1rem" }, children: [_jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Total net (streams)" }), _jsxs("div", { className: "stat-val", children: ["$", commissionPreview.data.totalNet.toLocaleString("en-US", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2
                                                    })] })] }), _jsxs("div", { className: "stat-box", children: [_jsxs("div", { className: "stat-lbl", children: ["Commission (", commissionPreview.data.commissionPercent.toFixed(1), "%)"] }), _jsxs("div", { className: "stat-val", children: ["$", commissionPreview.data.commissionAmount.toLocaleString("en-US", {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2
                                                    })] })] }), _jsxs("div", { className: "stat-box", children: [_jsx("div", { className: "stat-lbl", children: "Streams in range" }), _jsx("div", { className: "stat-val", children: commissionPreview.data.streams.length })] })] }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Started" }), _jsx("th", { children: "Completed earnings" }), _jsx("th", { children: "COGS" }), _jsx("th", { children: "Net" }), _jsx("th", { children: "Note" })] }) }), _jsx("tbody", { children: commissionPreview.data.streams.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "tbl-empty", children: "No streams in this date range" }) })) : (commissionPreview.data.streams.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: new Date(row.startedAt).toLocaleString() }), _jsx("td", { children: row.completedEarnings != null
                                                            ? `$${row.completedEarnings.toFixed(2)}`
                                                            : "—" }), _jsxs("td", { children: ["$", row.cogs.toFixed(2)] }), _jsxs("td", { className: "tbl-green", children: ["$", row.net.toFixed(2)] }), _jsx("td", { style: { fontSize: "0.62rem", color: "var(--muted)" }, children: row.missingCompletedEarnings ? "No completed earnings (net treated as $0)" : "" })] }, row.streamId)))) })] }) })] })) : null] }), PAYROLL_CSV_IMPORT_ENABLED ? (_jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "IMPORT PAYROLL CSV" }), _jsxs("div", { className: "form-group", style: { maxWidth: 280 }, children: [_jsx("label", { className: "form-label", htmlFor: "pr-user", children: "Assign to user" }), _jsxs("select", { id: "pr-user", className: "form-input", value: userId, onChange: (e) => setUserId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Select user \u2014" }), (users.data ?? []).map((u) => (_jsx("option", { value: u.id, children: userLabel(u) }, u.id)))] })] }), _jsxs("div", { className: `upload-zone${drag ? " drag" : ""}`, onClick: () => document.getElementById("csv-input")?.click(), onDragOver: (e) => {
                            e.preventDefault();
                            setDrag(true);
                        }, onDragLeave: () => setDrag(false), onDrop: (e) => {
                            e.preventDefault();
                            setDrag(false);
                            const f = e.dataTransfer.files[0];
                            if (f)
                                onFile(f);
                        }, children: [_jsx("div", { className: "upload-icon", children: "\uD83D\uDCC4" }), _jsx("div", { className: "upload-text", children: "Click to upload CSV file" }), _jsx("div", { className: "upload-hint", children: "Columns are auto-detected from the first row" })] }), _jsx("input", { id: "csv-input", type: "file", accept: ".csv", style: { display: "none" }, onChange: (e) => onFile(e.target.files?.[0] ?? null) }), preview && preview.headers.length ? (_jsxs("div", { style: { marginTop: "1rem" }, children: [_jsxs("div", { style: { fontSize: "0.6rem", color: "var(--muted)", marginBottom: "0.5rem" }, children: ["PREVIEW \u2014 ", preview.filename, " \u2014 ", preview.rows.length, " rows"] }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsx("tr", { children: preview.headers.map((h) => (_jsx("th", { children: h }, h))) }) }), _jsx("tbody", { children: preview.rows.slice(0, 8).map((r, i) => (_jsx("tr", { children: r.map((c, j) => (_jsx("td", { children: c }, j))) }, i))) })] }) }), preview.rows.length > 8 ? (_jsxs("div", { style: { fontSize: "0.6rem", color: "var(--muted)", padding: "0.5rem 0" }, children: ["\u2026and ", preview.rows.length - 8, " more rows"] })) : null, _jsxs("div", { style: { display: "flex", gap: "0.75rem", marginTop: "1rem" }, children: [_jsx("button", { type: "button", className: "btn btn-gold", disabled: importMutation.isPending, onClick: () => importMutation.mutate(), children: "\u2713 Import this CSV" }), _jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setPreview(null), children: "Cancel" })] }), importMutation.error ? (_jsx("p", { className: "error", style: { marginTop: "0.75rem" }, children: importMutation.error.message })) : null] })) : null] })) : null, _jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "PAYROLL RECORDS" }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Date imported" }), _jsx("th", { children: "User" }), _jsx("th", { children: "Rows" }), _jsx("th", { children: "File" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (payroll.data ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "tbl-empty", children: "No payroll records" }) })) : ((payroll.data ?? []).map((r) => (_jsxs("tr", { children: [_jsx("td", { children: new Date(r.imported_at).toLocaleDateString() }), _jsx("td", { className: "tbl-gold", children: r.display_name?.trim() || r.email }), _jsx("td", { children: r.rows }), _jsx("td", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: r.filename }), _jsx("td", { children: _jsx("button", { type: "button", className: "btn btn-danger btn-sm", onClick: () => {
                                                if (confirm("Delete this payroll record?"))
                                                    deleteMutation.mutate(r.id);
                                            }, children: "\u2715" }) })] }, r.id)))) })] }) })] }));
}
