import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type AdminUser = { id: string; email: string; display_name: string | null; role: string };
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

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users")
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

  const userLabel = (u: AdminUser) => u.display_name?.trim() || u.email;

  return (
    <section className="card">
      <h2>Payroll</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Import CSV and assign to a user (metadata only; file content is not stored)
      </p>

      {users.error || payroll.error ? (
        <p className="error">{String((users.error ?? payroll.error) as Error)}</p>
      ) : null}

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
