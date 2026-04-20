import { useCallback, useEffect, useMemo, useState } from "react";
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

type PreviewState = { filename: string; headers: string[]; rows: string[][] } | null;

type CommissionPreviewParams = { userId: string; start: string; end: string };

type CommissionPreviewResponse = {
  userId: string;
  commissionPercent: number;
  streams: Array<{
    streamId: string;
    startedAt: string;
    completedEarnings: number | null;
    cogs: number;
    net: number;
    missingCompletedEarnings: boolean;
  }>;
  totalNet: number;
  commissionAmount: number;
};

/** Set to true to show CSV import UI again. */
const PAYROLL_CSV_IMPORT_ENABLED = false;

function parseCsvFile(text: string, filename: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

export function PayrollPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [preview, setPreview] = useState<PreviewState>(null);
  const [drag, setDrag] = useState(false);

  const [commissionUserId, setCommissionUserId] = useState("");
  const [commissionStart, setCommissionStart] = useState("");
  const [commissionEnd, setCommissionEnd] = useState("");
  const [commissionParams, setCommissionParams] = useState<CommissionPreviewParams | null>(null);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users")
  });

  const commissionPreview = useQuery({
    queryKey: ["payroll-commission-preview", commissionParams],
    queryFn: () => {
      const p = commissionParams!;
      const qs = new URLSearchParams({ userId: p.userId, start: p.start, end: p.end });
      return api<CommissionPreviewResponse>(`/v1/admin/payroll/commission-preview?${qs.toString()}`);
    },
    enabled: commissionParams !== null
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

  const commissionEligibleUsers = useMemo(
    () => (users.data ?? []).filter((u) => u.pay_structure === "commission"),
    [users.data]
  );

  const selectedCommissionUser = useMemo(
    () => (users.data ?? []).find((u) => u.id === commissionUserId),
    [users.data, commissionUserId]
  );

  useEffect(() => {
    if (!commissionUserId) return;
    if (!commissionEligibleUsers.some((u) => u.id === commissionUserId)) {
      setCommissionUserId("");
      setCommissionParams(null);
    }
  }, [commissionEligibleUsers, commissionUserId]);

  return (
    <section className="card">
      <h2>Payroll</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Commission calculator from stream net profit
      </p>

      {users.error || payroll.error ? (
        <p className="error">{String((users.error ?? payroll.error) as Error)}</p>
      ) : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          COMMISSION PAYROLL
        </div>
        <p style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.45 }}>
          Streams whose <strong>started at</strong> date falls in the range (inclusive). Net per stream is completed
          earnings minus COGS; streams without completed earnings count as $0 net and are flagged below. Only users on{" "}
          <strong>commission</strong> pay appear in the list; hourly workers are excluded from this calculator.
        </p>
        <div className="grid-form" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <div className="form-group" style={{ minWidth: 200 }}>
            <label className="form-label" htmlFor="pc-user">
              User
            </label>
            <select
              id="pc-user"
              className="form-input"
              value={commissionUserId}
              onChange={(e) => setCommissionUserId(e.target.value)}
            >
              <option value="">— Select user —</option>
              {commissionEligibleUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {userLabel(u)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label className="form-label" htmlFor="pc-start">
              Start (YYYY-MM-DD)
            </label>
            <input
              id="pc-start"
              className="form-input"
              type="date"
              value={commissionStart}
              onChange={(e) => setCommissionStart(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ minWidth: 140 }}>
            <label className="form-label" htmlFor="pc-end">
              End (YYYY-MM-DD)
            </label>
            <input
              id="pc-end"
              className="form-input"
              type="date"
              value={commissionEnd}
              onChange={(e) => setCommissionEnd(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-gold"
            disabled={!commissionUserId || !commissionStart || !commissionEnd || commissionPreview.isFetching}
            onClick={() =>
              setCommissionParams({
                userId: commissionUserId,
                start: commissionStart,
                end: commissionEnd
              })
            }
          >
            Calculate
          </button>
        </div>
        {selectedCommissionUser ? (
          <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.75rem" }}>
            Commission rate:{" "}
            <strong style={{ color: "var(--gold)" }}>
              {Number(selectedCommissionUser.commission_percent ?? 0).toFixed(1)}%
            </strong>{" "}
            (edit under User Management)
          </div>
        ) : null}
        {commissionPreview.error ? (
          <p className="error" style={{ marginTop: "0.75rem" }}>
            {(commissionPreview.error as Error).message}
          </p>
        ) : null}
        {commissionPreview.data ? (
          <div style={{ marginTop: "1rem" }}>
            <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1rem" }}>
              <div className="stat-box">
                <div className="stat-lbl">Total net (streams)</div>
                <div className="stat-val">
                  $
                  {commissionPreview.data.totalNet.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-lbl">Commission ({commissionPreview.data.commissionPercent.toFixed(1)}%)</div>
                <div className="stat-val">
                  $
                  {commissionPreview.data.commissionAmount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-lbl">Streams in range</div>
                <div className="stat-val">{commissionPreview.data.streams.length}</div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Completed earnings</th>
                    <th>COGS</th>
                    <th>Net</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionPreview.data.streams.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="tbl-empty">
                        No streams in this date range
                      </td>
                    </tr>
                  ) : (
                    commissionPreview.data.streams.map((row) => (
                      <tr key={row.streamId}>
                        <td>{new Date(row.startedAt).toLocaleString()}</td>
                        <td>
                          {row.completedEarnings != null
                            ? `$${row.completedEarnings.toFixed(2)}`
                            : "—"}
                        </td>
                        <td>${row.cogs.toFixed(2)}</td>
                        <td className="tbl-green">${row.net.toFixed(2)}</td>
                        <td style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
                          {row.missingCompletedEarnings ? "No completed earnings (net treated as $0)" : ""}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
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
