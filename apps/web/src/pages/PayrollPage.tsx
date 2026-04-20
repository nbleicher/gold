import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  commission_percent: number;
  pay_structure: string;
  hourly_rate: number;
  requires_login: number;
};

type PayrollRow = {
  id: string;
  user_id: string;
  filename: string;
  rows: number;
  imported_at: string;
  email: string;
  display_name: string | null;
};

type WeeklySummaryRow = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  payStructure: string;
  commissionPercent: number;
  hourlyRate: number;
  hoursWorkedWeek: number;
  hourlyPay: number;
  commissionPay: number;
  totalPay: number;
};

type WeeklySummaryResponse = {
  from: string;
  to: string;
  users: WeeklySummaryRow[];
};

type PreviewState = { filename: string; headers: string[]; rows: string[][] } | null;

/** Set to true to show CSV import UI again. */
const PAYROLL_CSV_IMPORT_ENABLED = false;

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDates(weekOffset: number): Date[] {
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

function parseCsvFile(text: string, filename: string): { headers: string[]; rows: string[][] } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function PayrollPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [drag, setDrag] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from = localYmd(weekDates[0]);
  const to = localYmd(weekDates[6]);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users")
  });

  const weeklySummary = useQuery({
    queryKey: ["payroll-weekly-summary", from, to],
    queryFn: () => {
      const qs = new URLSearchParams({ from, to });
      return api<WeeklySummaryResponse>(`/v1/admin/payroll/weekly-summary?${qs.toString()}`);
    }
  });

  const payroll = useQuery({
    queryKey: ["admin-payroll"],
    queryFn: () => api<PayrollRow[]>("/v1/admin/payroll")
  });

  const importMutation = useMutation({
    mutationFn: () => {
      if (!userId || !preview) throw new Error("Select a user and a CSV file");
      return api<PayrollRow>("/v1/admin/payroll", {
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
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/admin/payroll/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-payroll"] })
  });

  const onFile = useCallback((file: File | null) => {
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

  const userLabel = (u: AdminUser) =>
    u.display_name?.trim() || (u.email.includes("@internal.invalid") ? `${u.id.slice(0, 8)}…` : u.email);

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <section className="card">
      <h2>Payroll</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Weekly pay from labor hours (hourly) and stream net profit (commission). Uses schedule labor entries and
        streams in the selected week (Mon–Sun).
      </p>

      {users.error || payroll.error || weeklySummary.error ? (
        <p className="error">{String((users.error ?? payroll.error ?? weeklySummary.error) as Error)}</p>
      ) : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          WEEKLY PAY SUMMARY
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
            ◀ Prev week
          </button>
          <span style={{ flex: 1, textAlign: "center", fontSize: "0.72rem", color: "var(--text-dim)" }}>{weekLabel}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
            Next week ▶
          </button>
        </div>
        <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Range: <strong style={{ color: "var(--text)" }}>{from}</strong> to <strong style={{ color: "var(--text)" }}>{to}</strong>
        </p>
        {weeklySummary.isFetching ? (
          <p style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Loading…</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Pay</th>
                  <th>Hours (wk)</th>
                  <th>Hourly pay</th>
                  <th>Commission pay</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(weeklySummary.data?.users ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="tbl-empty">
                      No users
                    </td>
                  </tr>
                ) : (
                  (weeklySummary.data?.users ?? []).map((r) => (
                    <tr key={r.userId}>
                      <td className="tbl-gold">{r.displayName?.trim() || r.email}</td>
                      <td style={{ fontSize: "0.7rem" }}>{r.role}</td>
                      <td style={{ fontSize: "0.7rem" }}>{r.payStructure}</td>
                      <td>{r.hoursWorkedWeek.toFixed(2)}</td>
                      <td>{money(r.hourlyPay)}</td>
                      <td>{money(r.commissionPay)}</td>
                      <td className="tbl-green">{money(r.totalPay)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {PAYROLL_CSV_IMPORT_ENABLED ? (
        <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
            IMPORT PAYROLL CSV
          </div>
          <div className="form-group" style={{ maxWidth: 280 }}>
            <label className="form-label" htmlFor="pr-user">
              Assign to user
            </label>
            <select
              id="pr-user"
              className="form-input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">— Select user —</option>
              {(users.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)}
                </option>
              ))}
            </select>
          </div>

          <div
            className={`upload-zone${drag ? " drag" : ""}`}
            onClick={() => document.getElementById("csv-input")?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
          >
            <div className="upload-icon">📄</div>
            <div className="upload-text">Click to upload CSV file</div>
            <div className="upload-hint">Columns are auto-detected from the first row</div>
          </div>
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />

          {preview && preview.headers.length ? (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.6rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                PREVIEW — {preview.filename} — {preview.rows.length} rows
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 8).map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 8 ? (
                <div style={{ fontSize: "0.6rem", color: "var(--muted)", padding: "0.5rem 0" }}>
                  …and {preview.rows.length - 8} more rows
                </div>
              ) : null}
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate()}
                >
                  ✓ Import this CSV
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setPreview(null)}>
                  Cancel
                </button>
              </div>
              {importMutation.error ? (
                <p className="error" style={{ marginTop: "0.75rem" }}>
                  {(importMutation.error as Error).message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
        PAYROLL RECORDS
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date imported</th>
              <th>User</th>
              <th>Rows</th>
              <th>File</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(payroll.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="tbl-empty">
                  No payroll records
                </td>
              </tr>
            ) : (
              (payroll.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.imported_at).toLocaleDateString()}</td>
                  <td className="tbl-gold">{r.display_name?.trim() || r.email}</td>
                  <td>{r.rows}</td>
                  <td style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{r.filename}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm("Delete this payroll record?")) deleteMutation.mutate(r.id);
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
