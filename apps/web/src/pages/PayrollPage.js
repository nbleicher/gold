import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
/** Set to true to show CSV import UI again. */
const PAYROLL_CSV_IMPORT_ENABLED = false;
function localYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function getWeekDates(weekOffset) {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
    });
}
function parseCsvFile(text, filename) {
    const lines = text.split("\n").filter((l) => l.trim());
    if (!lines.length)
        return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
    return { headers, rows };
}
function money(n) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
export function PayrollPage() {
    const qc = useQueryClient();
    const [userId, setUserId] = useState("");
    const [preview, setPreview] = useState(null);
    const [drag, setDrag] = useState(false);
    const [weekOffset, setWeekOffset] = useState(0);
    const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
    const from = localYmd(weekDates[0]);
    const to = localYmd(weekDates[6]);
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users")
    });
    const weeklySummary = useQuery({
        queryKey: ["payroll-weekly-summary", from, to],
        queryFn: () => {
            const qs = new URLSearchParams({ from, to });
            return api(`/v1/admin/payroll/weekly-summary?${qs.toString()}`);
        }
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
    const userLabel = (u) => u.display_name?.trim() || (u.email.includes("@internal.invalid") ? `${u.id.slice(0, 8)}…` : u.email);
    const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Payroll" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "Weekly pay from labor hours (hourly) and stream net profit (commission). Uses schedule labor entries and streams in the selected week (Mon\u2013Sun)." }), users.error || payroll.error || weeklySummary.error ? (_jsx("p", { className: "error", children: String((users.error ?? payroll.error ?? weeklySummary.error)) })) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "WEEKLY PAY SUMMARY" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }, children: [_jsx("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => setWeekOffset((w) => w - 1), children: "\u25C0 Prev week" }), _jsx("span", { style: { flex: 1, textAlign: "center", fontSize: "0.72rem", color: "var(--text-dim)" }, children: weekLabel }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => setWeekOffset((w) => w + 1), children: "Next week \u25B6" })] }), _jsxs("p", { style: { fontSize: "0.62rem", color: "var(--muted)", marginBottom: "0.75rem" }, children: ["Range: ", _jsx("strong", { style: { color: "var(--text)" }, children: from }), " to ", _jsx("strong", { style: { color: "var(--text)" }, children: to })] }), weeklySummary.isFetching ? (_jsx("p", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: "Loading\u2026" })) : (_jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "User" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Pay" }), _jsx("th", { children: "Hours (wk)" }), _jsx("th", { children: "Hourly pay" }), _jsx("th", { children: "Commission pay" }), _jsx("th", { children: "Total" })] }) }), _jsx("tbody", { children: (weeklySummary.data?.users ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "tbl-empty", children: "No users" }) })) : ((weeklySummary.data?.users ?? []).map((r) => (_jsxs("tr", { children: [_jsx("td", { className: "tbl-gold", children: r.displayName?.trim() || r.email }), _jsx("td", { style: { fontSize: "0.7rem" }, children: r.role }), _jsx("td", { style: { fontSize: "0.7rem" }, children: r.payStructure }), _jsx("td", { children: r.hoursWorkedWeek.toFixed(2) }), _jsx("td", { children: money(r.hourlyPay) }), _jsx("td", { children: money(r.commissionPay) }), _jsx("td", { className: "tbl-green", children: money(r.totalPay) })] }, r.userId)))) })] }) }))] }), PAYROLL_CSV_IMPORT_ENABLED ? (_jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "IMPORT PAYROLL CSV" }), _jsxs("div", { className: "form-group", style: { maxWidth: 280 }, children: [_jsx("label", { className: "form-label", htmlFor: "pr-user", children: "Assign to user" }), _jsxs("select", { id: "pr-user", className: "form-input", value: userId, onChange: (e) => setUserId(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 Select user \u2014" }), (users.data ?? []).map((u) => (_jsx("option", { value: u.id, children: userLabel(u) }, u.id)))] })] }), _jsxs("div", { className: `upload-zone${drag ? " drag" : ""}`, onClick: () => document.getElementById("csv-input")?.click(), onDragOver: (e) => {
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
