import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

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
  entry_type?: string;
  hours_worked?: number | null;
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

const MAX_DAILY_HOURS = 12;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function cellKey(userId: string, date: string) {
  return `${userId}|${date}`;
}

type CellDraft = Record<string, string>;

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
  cellDraft: CellDraft;
  setCellDraft: Dispatch<SetStateAction<CellDraft>>;
  laborDayMutation: {
    mutate: (
      args: { userId: string; date: string; hoursWorked: number },
      opts?: { onSuccess?: () => void; onError?: () => void }
    ) => void;
  };
  userLabel: (u: AdminUser) => string;
}) {
  const readCellHours = (userId: string, dateStr: string) => {
    const k = cellKey(userId, dateStr);
    const draft = cellDraft[k];
    if (draft !== undefined) {
      const n = Number(draft);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return laborHoursMap.get(k) ?? 0;
  };

  const rowHours = (userId: string) =>
    weekDayYmds.reduce((acc, dateStr) => acc + readCellHours(userId, dateStr), 0);

  const grandTotal = hourlyWorkers.reduce((acc, u) => acc + rowHours(u.id) * Number(u.hourly_rate ?? 0), 0);

  const persistCell = (userId: string, dateStr: string) => {
    const k = cellKey(userId, dateStr);
    const raw = cellDraft[k];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const nextHours = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(nextHours) || nextHours < 0 || nextHours > MAX_DAILY_HOURS) return;

    const serverH = laborHoursMap.get(k) ?? 0;
    if (Math.abs(serverH - nextHours) < 0.0001) {
      setCellDraft((d) => {
        const copy = { ...d };
        delete copy[k];
        return copy;
      });
      return;
    }

    laborDayMutation.mutate(
      { userId, date: dateStr, hoursWorked: nextHours },
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
                      const serverHours = laborHoursMap.get(k) ?? 0;
                      const value = cellDraft[k] ?? (serverHours > 0 ? String(serverHours) : "");
                      return (
                        <td key={dateStr} style={{ textAlign: "center", verticalAlign: "middle", minWidth: "5rem" }}>
                          <input
                            className="form-input"
                            aria-label={`Hours ${userLabel(u)} ${dateStr}`}
                            type="number"
                            min={0}
                            max={MAX_DAILY_HOURS}
                            step={0.25}
                            value={value}
                            placeholder="0"
                            onChange={(e) =>
                              setCellDraft((prev) => ({
                                ...prev,
                                [k]: e.target.value
                              }))
                            }
                            onBlur={() => persistCell(u.id, dateStr)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            style={{
                              width: "100%",
                              maxWidth: "4.5rem",
                              padding: "0.2rem 0.25rem",
                              fontSize: "0.68rem",
                              margin: "0 auto",
                              textAlign: "center"
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
    mutationFn: (args: { userId: string; date: string; hoursWorked: number }) =>
      api<{ ok: boolean }>("/v1/admin/payroll/labor-day", {
        method: "PUT",
        body: JSON.stringify(args)
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-weekly-summary", from, to] });
      qc.invalidateQueries({ queryKey: ["admin-schedules"] });
    }
  });

  const userLabel = (u: AdminUser) => u.display_name?.trim() || u.username;

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

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const payTotals = useMemo(() => {
    const rows = weeklySummary.data?.users ?? [];
    return rows.reduce(
      (sum, row) => ({
        hours: sum.hours + Number(row.hoursWorkedWeek ?? 0),
        hourly: sum.hourly + Number(row.hourlyPay ?? 0),
        commission: sum.commission + Number(row.commissionPay ?? 0),
        total: sum.total + Number(row.totalPay ?? 0)
      }),
      { hours: 0, hourly: 0, commission: 0, total: 0 }
    );
  }, [weeklySummary.data]);

  return (
    <section className="card payroll-workspace">
      <div className="page-head">
        <div>
          <h1>Payroll</h1>
          <p>Weekly hourly labor and commission pay.</p>
        </div>
      </div>

      {users.error || weeklySummary.error || schedules.error ? (
        <p className="error">
          {String((users.error ?? weeklySummary.error ?? schedules.error) as Error)}
        </p>
      ) : null}

      <div className="metric-grid payroll-summary-grid">
        <div className="metric-card">
          <div className="metric-label">Week</div>
          <div className="metric-value">{weekLabel}</div>
          <div className="metric-detail">{from} to {to}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total pay</div>
          <div className="metric-value good">{weeklySummary.isFetching ? "-" : money(payTotals.total)}</div>
          <div className="metric-detail">Hourly plus commission</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Hourly labor</div>
          <div className="metric-value">{weeklySummary.isFetching ? "-" : payTotals.hours.toFixed(2)}</div>
          <div className="metric-detail">{weeklySummary.isFetching ? "Loading" : money(payTotals.hourly)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Commission</div>
          <div className="metric-value">{weeklySummary.isFetching ? "-" : money(payTotals.commission)}</div>
          <div className="metric-detail">Based on completed stream net</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>
            Prev week
          </button>
          <span style={{ flex: 1, textAlign: "center", fontSize: "0.72rem", color: "var(--text-dim)" }}>{weekLabel}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>
            Next week
          </button>
        </div>
        <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Range: <strong style={{ color: "var(--text)" }}>{from}</strong> to <strong style={{ color: "var(--text)" }}>{to}</strong>
        </p>

        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          WEEKLY ATTENDANCE
        </div>
        <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          For hourly workers, enter total hours worked per day. Daily hours are capped at {MAX_DAILY_HOURS}.
        </p>
        {laborDayMutation.error ? (
          <p className="error" style={{ marginBottom: "0.5rem" }}>
            {(laborDayMutation.error as Error).message}
          </p>
        ) : null}
        {schedules.isFetching && !schedules.data ? (
          <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "1.25rem" }}>Loading attendance...</p>
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
          <p style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Loading...</p>
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
    </section>
  );
}
