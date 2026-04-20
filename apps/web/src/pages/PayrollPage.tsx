import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: number;
  commission_percent: number;
  pay_structure: string;
  hourly_rate: number;
  requires_login: number;
};

type ScheduleLaborRow = {
  date: string;
  streamer_id: string;
  entry_type?: string;
  hours_worked?: number | null;
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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function cellKey(userId: string, date: string) {
  return `${userId}|${date}`;
}

function AttendanceGrid({
  hourlyWorkers,
  weekDates,
  weekDayYmds,
  laborHoursMap,
  cellDraft,
  setCellDraft,
  laborDayMutation,
  userLabel
}: {
  hourlyWorkers: AdminUser[];
  weekDates: Date[];
  weekDayYmds: string[];
  laborHoursMap: Map<string, number>;
  cellDraft: Record<string, string>;
  setCellDraft: Dispatch<SetStateAction<Record<string, string>>>;
  laborDayMutation: {
    mutate: (args: { userId: string; date: string; hours: number }, opts?: { onSuccess?: () => void }) => void;
  };
  userLabel: (u: AdminUser) => string;
}) {
  const rowHours = (userId: string) => {
    let hours = 0;
    for (const dateStr of weekDayYmds) {
      const k = cellKey(userId, dateStr);
      const d = cellDraft[k];
      if (d !== undefined) {
        const n = parseFloat(d);
        if (Number.isFinite(n) && n >= 0) hours += n;
      } else {
        hours += laborHoursMap.get(k) ?? 0;
      }
    }
    return hours;
  };

  const grandTotal = hourlyWorkers.reduce((acc, u) => acc + rowHours(u.id) * Number(u.hourly_rate ?? 0), 0);

  return (
    <div className="tbl-wrap" style={{ marginBottom: "1.25rem" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Worker</th>
            {weekDates.map((d, i) => (
              <th key={weekDayYmds[i]} style={{ textAlign: "center", fontSize: "0.65rem" }}>
                <div>{DAY_LABELS[i]}</div>
                <div style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.58rem" }}>{d.getDate()}</div>
              </th>
            ))}
            <th style={{ textAlign: "right" }}>Total $</th>
          </tr>
        </thead>
        <tbody>
          {hourlyWorkers.length === 0 ? (
            <tr>
              <td colSpan={9} className="tbl-empty">
                No active hourly workers
              </td>
            </tr>
          ) : (
            <>
              {hourlyWorkers.map((u) => {
                const rate = Number(u.hourly_rate ?? 0);
                const totalPay = rowHours(u.id) * rate;
                return (
                  <tr key={u.id}>
                    <td className="tbl-gold" style={{ whiteSpace: "nowrap" }}>
                      {userLabel(u)}
                    </td>
                    {weekDayYmds.map((dateStr) => {
                      const k = cellKey(u.id, dateStr);
                      const serverH = laborHoursMap.get(k) ?? 0;
                      const draft = cellDraft[k];
                      const value = draft !== undefined ? draft : serverH === 0 ? "" : String(serverH);
                      return (
                        <td key={dateStr} style={{ textAlign: "center", verticalAlign: "middle" }}>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            step={0.25}
                            inputMode="decimal"
                            aria-label={`Hours ${userLabel(u)} ${dateStr}`}
                            style={{
                              width: "3.5rem",
                              padding: "0.2rem 0.35rem",
                              fontSize: "0.72rem",
                              textAlign: "center",
                              margin: "0 auto"
                            }}
                            value={value}
                            onChange={(e) => setCellDraft((prev) => ({ ...prev, [k]: e.target.value }))}
                            onBlur={() => {
                              const raw = cellDraft[k];
                              const effective = raw !== undefined ? raw : serverH === 0 ? "" : String(serverH);
                              let hours = parseFloat(String(effective).trim());
                              if (!Number.isFinite(hours) || hours < 0) hours = 0;
                              const prev = laborHoursMap.get(k) ?? 0;
                              if (Math.abs(hours - prev) < 1e-6) {
                                setCellDraft((d) => {
                                  const n = { ...d };
                                  delete n[k];
                                  return n;
                                });
                                return;
                              }
                              laborDayMutation.mutate(
                                { userId: u.id, date: dateStr, hours },
                                {
                                  onSuccess: () => {
                                    setCellDraft((d) => {
                                      const next = { ...d };
                                      delete next[k];
                                      return next;
                                    });
                                  }
                                }
                              );
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="tbl-green" style={{ textAlign: "right", fontWeight: 600 }}>
                      {money(totalPay)}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td colSpan={8} style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                  Totals
                </td>
                <td className="tbl-green" style={{ textAlign: "right", fontWeight: 600 }}>
                  {money(grandTotal)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PayrollPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [drag, setDrag] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [cellDraft, setCellDraft] = useState<Record<string, string>>({});

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from = localYmd(weekDates[0]);
  const to = localYmd(weekDates[6]);

  useEffect(() => {
    setCellDraft({});
  }, [from, to]);

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

  const schedules = useQuery({
    queryKey: ["admin-schedules", from, to, "all"],
    queryFn: () =>
      api<ScheduleLaborRow[]>(
        `/v1/admin/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
  });

  const laborDayMutation = useMutation({
    mutationFn: (args: { userId: string; date: string; hours: number }) =>
      api<{ ok: boolean }>("/v1/admin/payroll/labor-day", {
        method: "PUT",
        body: JSON.stringify(args)
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-weekly-summary", from, to] });
      qc.invalidateQueries({ queryKey: ["admin-schedules"] });
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

  const weekDayYmds = useMemo(() => weekDates.map((d) => localYmd(d)), [weekDates]);

  const hourlyWorkers = useMemo(
    () => (users.data ?? []).filter((u) => u.pay_structure === "hourly" && Boolean(u.is_active)),
    [users.data]
  );

  const laborHoursMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of schedules.data ?? []) {
      if (s.entry_type !== "labor" || s.hours_worked == null) continue;
      const k = cellKey(s.streamer_id, s.date);
      m.set(k, (m.get(k) ?? 0) + Number(s.hours_worked));
    }
    return m;
  }, [schedules.data]);

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <section className="card">
      <h2>Payroll</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Hourly labor hours are entered in the weekly attendance grid below. Commission pay uses stream activity in the
        selected week (Mon–Sun).
      </p>

      {users.error || payroll.error || weeklySummary.error || schedules.error ? (
        <p className="error">
          {String((users.error ?? payroll.error ?? weeklySummary.error ?? schedules.error) as Error)}
        </p>
      ) : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
            ◀ Prev week
          </button>
          <span style={{ flex: 1, textAlign: "center", fontSize: "0.72rem", color: "var(--text-dim)" }}>{weekLabel}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
            Next week ▶
          </button>
        </div>
        <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Range: <strong style={{ color: "var(--text)" }}>{from}</strong> to <strong style={{ color: "var(--text)" }}>{to}</strong>
        </p>

        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          WEEKLY ATTENDANCE
        </div>
        <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Enter hours for hourly workers (shippers and baggers). Hours apply to this week only and feed the pay summary
          below.
        </p>
        {laborDayMutation.error ? (
          <p className="error" style={{ marginBottom: "0.5rem" }}>
            {(laborDayMutation.error as Error).message}
          </p>
        ) : null}
        {schedules.isFetching && !schedules.data ? (
          <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "1.25rem" }}>Loading attendance…</p>
        ) : (
          <AttendanceGrid
            hourlyWorkers={hourlyWorkers}
            weekDates={weekDates}
            weekDayYmds={weekDayYmds}
            laborHoursMap={laborHoursMap}
            cellDraft={cellDraft}
            setCellDraft={setCellDraft}
            laborDayMutation={laborDayMutation}
            userLabel={userLabel}
          />
        )}

        <div
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.12em",
            color: "var(--muted)",
            marginBottom: "0.75rem",
            marginTop: "1.5rem"
          }}
        >
          WEEKLY PAY SUMMARY
        </div>
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
