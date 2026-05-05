import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { hasSupabaseClient, supabase } from "../lib/supabase";

type AdminUser = {
  id: string;
  username: string;
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
  start_time?: string;
  entry_type?: string;
  hours_worked?: number | null;
};

type PayrollRow = {
  id: string;
  user_id: string;
  filename: string;
  storage_path?: string | null;
  rows: number;
  imported_at: string;
  username: string;
  email: string;
  display_name: string | null;
};

type WeeklySummaryRow = {
  userId: string;
  username: string;
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
const PAYROLL_CSV_IMPORT_ENABLED = true;

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

/** Display `HH:MM` (24h) as 12-hour labels, e.g. 2am, 1:30pm (values stay 24h for the API). */
function formatTime12hLabel(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h24 = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h24) || !Number.isInteger(min)) return hhmm;
  const period = h24 < 12 ? "am" : "pm";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  if (min === 0) return `${h12}${period}`;
  return `${h12}:${String(min).padStart(2, "0")}${period}`;
}

/** 30-minute steps for shift start/end dropdowns (value "" = unset). */
const TIME_SELECT_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [{ value: "", label: "—" }];
  for (let mins = 0; mins < 24 * 60; mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    opts.push({ value, label: formatTime12hLabel(value) });
  }
  return opts;
})();

const TIME_HALF_HOUR_VALUES = TIME_SELECT_OPTIONS.filter((o) => o.value !== "");

/** Include legacy/off-grid HH:MM values so controlled selects stay valid after switching from 15- to 30-minute steps. */
function timeSelectOptionsIncludingValues(...currents: string[]) {
  const extras = [...new Set(currents.filter(Boolean))].filter(
    (v) => !TIME_SELECT_OPTIONS.some((o) => o.value === v)
  );
  if (!extras.length) return TIME_SELECT_OPTIONS;
  const inserted = extras
    .map((v) => ({ value: v, label: formatTime12hLabel(v) }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return [TIME_SELECT_OPTIONS[0], ...inserted, ...TIME_SELECT_OPTIONS.slice(1)];
}

function minutesFromHHMM(s: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Snap total minutes-from-midnight to nearest 30-min option (for display end from start + hours). */
function snapMinutesToNearestHalfHour(totalMinutes: number): string {
  let best = TIME_HALF_HOUR_VALUES[0]?.value ?? "00:00";
  let bestD = Infinity;
  for (const o of TIME_HALF_HOUR_VALUES) {
    const om = minutesFromHHMM(o.value);
    if (!Number.isFinite(om)) continue;
    const d = Math.abs(om - totalMinutes);
    if (d < bestD) {
      bestD = d;
      best = o.value;
    }
  }
  return best;
}

function cellKey(userId: string, date: string) {
  return `${userId}|${date}`;
}

type LaborShift = { start: string; end: string };
type CellDraft = Record<string, LaborShift>;

function AttendanceGrid({
  hourlyWorkers,
  weekDates,
  weekDayYmds,
  laborHoursMap,
  laborShiftMap,
  cellDraft,
  setCellDraft,
  laborDayMutation,
  userLabel
}: {
  hourlyWorkers: AdminUser[];
  weekDates: Date[];
  weekDayYmds: string[];
  laborHoursMap: Map<string, number>;
  laborShiftMap: Map<string, LaborShift | null>;
  cellDraft: CellDraft;
  setCellDraft: Dispatch<SetStateAction<CellDraft>>;
  laborDayMutation: {
    mutate: (
      args: { userId: string; date: string; startTime?: string; endTime?: string },
      opts?: { onSuccess?: () => void }
    ) => void;
  };
  userLabel: (u: AdminUser) => string;
}) {
  const cellHours = (userId: string, dateStr: string) => {
    const k = cellKey(userId, dateStr);
    const draft = cellDraft[k];
    const serverH = laborHoursMap.get(k) ?? 0;
    if (draft) {
      const st = draft.start.trim();
      const en = draft.end.trim();
      if (st && en) {
        const sm = minutesFromHHMM(st);
        const em = minutesFromHHMM(en);
        if (Number.isFinite(sm) && Number.isFinite(em) && em > sm) return (em - sm) / 60;
      }
      return serverH;
    }
    return serverH;
  };

  const rowHours = (userId: string) =>
    weekDayYmds.reduce((acc, dateStr) => acc + cellHours(userId, dateStr), 0);

  const grandTotal = hourlyWorkers.reduce((acc, u) => acc + rowHours(u.id) * Number(u.hourly_rate ?? 0), 0);

  const persistCell = (userId: string, dateStr: string, next: LaborShift) => {
    const k = cellKey(userId, dateStr);
    const startTrim = next.start.trim();
    const endTrim = next.end.trim();
    const serverH = laborHoursMap.get(k) ?? 0;
    const serverSh = laborShiftMap.get(k) ?? null;

    if (!startTrim && !endTrim) {
      if (serverH > 0) {
        laborDayMutation.mutate(
          { userId, date: dateStr, startTime: "", endTime: "" },
          {
            onSuccess: () => {
              setCellDraft((d) => {
                const copy = { ...d };
                delete copy[k];
                return copy;
              });
            }
          }
        );
      } else {
        setCellDraft((d) => {
          const copy = { ...d };
          delete copy[k];
          return copy;
        });
      }
      return;
    }

    if (!startTrim || !endTrim) return;

    if (serverSh && serverSh.start === startTrim && serverSh.end === endTrim) {
      setCellDraft((d) => {
        const copy = { ...d };
        delete copy[k];
        return copy;
      });
      return;
    }

    laborDayMutation.mutate(
      { userId, date: dateStr, startTime: startTrim, endTime: endTrim },
      {
        onSuccess: () => {
          setCellDraft((d) => {
            const copy = { ...d };
            delete copy[k];
            return copy;
          });
        }
      }
    );
  };

  const onShiftFieldChange = (userId: string, dateStr: string, field: keyof LaborShift, value: string) => {
    const k = cellKey(userId, dateStr);
    const serverSh = laborShiftMap.get(k) ?? null;
    const base: LaborShift = {
      start: serverSh?.start ?? "",
      end: serverSh?.end ?? ""
    };
    setCellDraft((prev) => {
      const cur = prev[k] ?? base;
      const next = { ...cur, [field]: value };
      queueMicrotask(() => persistCell(userId, dateStr, next));
      return { ...prev, [k]: next };
    });
  };

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
                      const serverSh = laborShiftMap.get(k) ?? null;
                      const draft = cellDraft[k];
                      const startVal = draft?.start ?? serverSh?.start ?? "";
                      const endVal = draft?.end ?? serverSh?.end ?? "";
                      const h = cellHours(u.id, dateStr);
                      const selectOpts = timeSelectOptionsIncludingValues(startVal, endVal);
                      return (
                        <td key={dateStr} style={{ textAlign: "center", verticalAlign: "middle", minWidth: "5.5rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", alignItems: "stretch", width: "100%" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", alignItems: "stretch" }}>
                              <select
                                className="form-input"
                                aria-label={`Start ${userLabel(u)} ${dateStr}`}
                                style={{
                                  width: "100%",
                                  maxWidth: "4.25rem",
                                  padding: "0.1rem 0.15rem",
                                  fontSize: "0.62rem",
                                  margin: "0 auto"
                                }}
                                value={startVal}
                                onChange={(e) => onShiftFieldChange(u.id, dateStr, "start", e.target.value)}
                              >
                                {selectOpts.map((o) => (
                                  <option key={`s-${o.value}`} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="form-input"
                                aria-label={`End ${userLabel(u)} ${dateStr}`}
                                style={{
                                  width: "100%",
                                  maxWidth: "4.25rem",
                                  padding: "0.1rem 0.15rem",
                                  fontSize: "0.62rem",
                                  margin: "0 auto"
                                }}
                                value={endVal}
                                onChange={(e) => onShiftFieldChange(u.id, dateStr, "end", e.target.value)}
                              >
                                {selectOpts.map((o) => (
                                  <option key={`e-${o.value}`} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <span style={{ fontSize: "0.58rem", color: "var(--muted)" }}>{h > 0 ? `${h.toFixed(2)} h` : "—"}</span>
                          </div>
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
  const [cellDraft, setCellDraft] = useState<CellDraft>({});

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
    mutationFn: (args: { userId: string; date: string; startTime?: string; endTime?: string }) =>
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
    mutationFn: async () => {
      if (!userId || !preview) throw new Error("Select a user and a CSV file");
      let storagePath: string | null = null;
      if (hasSupabaseClient && supabase) {
        const payload = new Blob([`${preview.headers.join(",")}\n${preview.rows.map((r) => r.join(",")).join("\n")}`], {
          type: "text/csv"
        });
        const filePath = `payroll/${userId}/${Date.now()}-${preview.filename}`;
        const uploaded = await supabase.storage.from("payroll-csv").upload(filePath, payload, {
          contentType: "text/csv",
          upsert: false
        });
        if (uploaded.error) throw uploaded.error;
        storagePath = filePath;
      }
      return api<PayrollRow>("/v1/admin/payroll", {
        method: "POST",
        body: JSON.stringify({
          userId,
          filename: preview.filename,
          rows: preview.rows.length,
          storagePath
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
    u.display_name?.trim() || u.username;

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

  /** Display start/end from DB; end is snapped to 30-min grid from start + hours when start is not legacy 00:00. */
  const laborShiftMap = useMemo(() => {
    const m = new Map<string, LaborShift | null>();
    const agg = new Map<string, { totalH: number; startTime: string | null }>();
    for (const s of schedules.data ?? []) {
      if (s.entry_type !== "labor" || s.hours_worked == null) continue;
      const k = cellKey(s.streamer_id, s.date);
      const st = (s.start_time ?? "").slice(0, 5);
      const row = agg.get(k) ?? { totalH: 0, startTime: null as string | null };
      row.totalH += Number(s.hours_worked);
      if (st !== "00:00" && /^\d{2}:\d{2}$/.test(st)) row.startTime = st;
      agg.set(k, row);
    }
    for (const [k, v] of agg) {
      if (!v.startTime) {
        m.set(k, null);
        continue;
      }
      const startM = minutesFromHHMM(v.startTime);
      const endRawM = startM + v.totalH * 60;
      const endSnapped = snapMinutesToNearestHalfHour(endRawM);
      m.set(k, { start: v.startTime, end: endSnapped });
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
          For hourly workers (shippers and baggers), set start and end time per day (30-minute steps). Hours are computed
          for the pay summary below. Legacy entries stored without a start time show totals only until you set times.
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
            laborShiftMap={laborShiftMap}
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
                      <td className="tbl-gold">{r.displayName?.trim() || r.username}</td>
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
                  <td className="tbl-gold">{r.display_name?.trim() || r.username}</td>
                  <td>{r.rows}</td>
                  <td style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                    {r.filename}
                    {r.storage_path ? <div style={{ opacity: 0.7 }}>{r.storage_path}</div> : null}
                  </td>
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
