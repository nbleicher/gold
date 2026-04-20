import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type AppRole = "admin" | "streamer" | "shipper" | "bagger";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  is_active: number;
  deactivated_at: string | null;
  deactivated_by: string | null;
  commission_percent: number;
  pay_structure: string;
  hourly_rate: number;
  requires_login: number;
};

export function AdminUsersPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("streamer");
  const [commissionPercent, setCommissionPercent] = useState("10");
  const [hourlyRate, setHourlyRate] = useState("15");

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users")
  });

  const createUser = useMutation({
    mutationFn: () => {
      const pct = Number(commissionPercent);
      const hr = Number(hourlyRate);
      const body: Record<string, unknown> = {
        displayName: displayName.trim() || undefined,
        role
      };
      if (role === "streamer" && Number.isFinite(pct)) {
        body.commissionPercent = pct;
      }
      if ((role === "shipper" || role === "bagger") && Number.isFinite(hr)) {
        body.hourlyRate = hr;
      }
      if (role === "admin" || role === "streamer") {
        body.email = email.trim();
        body.password = password;
      }
      return api<{ id: string; role: AppRole; displayName: string | null }>("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(body)
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("streamer");
      setCommissionPercent("10");
      setHourlyRate("15");
    }
  });

  const deactivateUser = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] })
  });
  const reactivateUser = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/admin/users/${id}/reactivate`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] })
  });

  const [purgeTarget, setPurgeTarget] = useState<AdminUser | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState("");

  const [payEditId, setPayEditId] = useState<string | null>(null);
  const [payEditCommission, setPayEditCommission] = useState("");
  const [payEditHourly, setPayEditHourly] = useState("");

  const patchPaySettings = useMutation({
    mutationFn: (args: { id: string; commissionPercent?: number; hourlyRate?: number }) => {
      const body: Record<string, number> = {};
      if (args.commissionPercent !== undefined) body.commissionPercent = args.commissionPercent;
      if (args.hourlyRate !== undefined) body.hourlyRate = args.hourlyRate;
      return api<{ ok: boolean }>(`/v1/admin/users/${args.id}/pay-settings`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setPayEditId(null);
    }
  });

  const purgeUser = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: string }) =>
      api<{ ok: boolean }>(`/v1/admin/users/${id}/purge-from-app`, {
        method: "POST",
        body: JSON.stringify({ confirm })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setPurgeTarget(null);
      setPurgeConfirm("");
    }
  });

  const needsLoginCredentials = role === "admin" || role === "streamer";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    if (needsLoginCredentials) {
      if (!email.trim() || !password.trim()) return;
    }
    createUser.mutate();
  };

  const canLoginRow = (u: AdminUser) => Boolean(u.requires_login) && (u.role === "admin" || u.role === "streamer");

  const accountLabel = (u: AdminUser) => {
    if (!canLoginRow(u)) return "—";
    if (u.email.includes("@internal.invalid")) return "—";
    return u.email;
  };

  const payLabel = (u: AdminUser) => {
    if (u.role === "admin") return "—";
    return u.pay_structure === "hourly"
      ? `$${Number(u.hourly_rate ?? 0).toFixed(2)}/hr`
      : `${Number(u.commission_percent ?? 0).toFixed(1)}%`;
  };

  const loginBadge = (u: AdminUser) =>
    canLoginRow(u) ? (
      <span className="badge badge-morning">Yes</span>
    ) : (
      <span className="badge badge-evening">No</span>
    );

  return (
    <section className="card">
      <h2>User Management</h2>

      {users.error ? <p className="error">{(users.error as Error).message}</p> : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          CREATE USER
        </div>
        <form onSubmit={onSubmit}>
          <div
            className="grid-form"
            style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem" }}
          >
            <div className="form-group" style={{ minWidth: 200, flex: "1 1 200px" }}>
              <label className="form-label" htmlFor="au-display-name">
                Display name
              </label>
              <input
                id="au-display-name"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label className="form-label" htmlFor="au-role">
                Role
              </label>
              <select
                id="au-role"
                className="form-input"
                value={role}
                onChange={(e) => setRole(e.target.value as AppRole)}
              >
                <option value="streamer">Streamer</option>
                <option value="admin">Admin</option>
                <option value="shipper">Shipper</option>
                <option value="bagger">Bagger</option>
              </select>
            </div>
            {role === "streamer" ? (
              <div className="form-group" style={{ minWidth: 100 }}>
                <label className="form-label" htmlFor="au-commission">
                  Commission %
                </label>
                <input
                  id="au-commission"
                  className="form-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                />
              </div>
            ) : null}
            {role === "shipper" || role === "bagger" ? (
              <div className="form-group" style={{ minWidth: 100 }}>
                <label className="form-label" htmlFor="au-hourly">
                  Hourly rate
                </label>
                <input
                  id="au-hourly"
                  className="form-input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {role === "shipper" || role === "bagger" ? (
            <p style={{ fontSize: "0.62rem", color: "var(--muted)", margin: "0 0 0.75rem" }}>
              Shippers and baggers are payroll-only and cannot sign in.
            </p>
          ) : null}

          {needsLoginCredentials ? (
            <div
              className="grid-form"
              style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem" }}
            >
              <div className="form-group" style={{ minWidth: 220, flex: "2 1 240px" }}>
                <label className="form-label" htmlFor="au-email">
                  Email
                </label>
                <input
                  id="au-email"
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="form-group" style={{ minWidth: 220, flex: "2 1 220px" }}>
                <label className="form-label" htmlFor="au-password">
                  Password
                </label>
                <input
                  id="au-password"
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
            </div>
          ) : null}

          <button type="submit" className="btn btn-gold" disabled={createUser.isPending}>
            Create user
          </button>
          {createUser.error ? <p className="error">{(createUser.error as Error).message}</p> : null}
        </form>
      </div>

      <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
        USERS
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Account</th>
              <th>Role</th>
              <th>Pay</th>
              <th>Login</th>
              <th>Status</th>
              <th>Deactivated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="tbl-empty">
                  No users found
                </td>
              </tr>
            ) : (
              (users.data ?? []).map((u) => {
                const isActive = Boolean(u.is_active);
                const isSelf = u.id === profile?.id;
                return (
                  <tr key={u.id}>
                    <td className="tbl-gold">{u.display_name?.trim() || "—"}</td>
                    <td style={{ fontSize: "0.72rem" }}>{accountLabel(u)}</td>
                    <td>{u.role}</td>
                    <td style={{ minWidth: "10rem", fontSize: "0.7rem" }}>
                      {u.role === "admin" ? (
                        <span>—</span>
                      ) : payEditId === u.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {u.role === "streamer" ? (
                            <input
                              className="form-input"
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              style={{ maxWidth: "6rem", padding: "0.25rem 0.4rem" }}
                              value={payEditCommission}
                              onChange={(e) => setPayEditCommission(e.target.value)}
                              disabled={patchPaySettings.isPending}
                              aria-label="Commission percent"
                            />
                          ) : (
                            <input
                              className="form-input"
                              type="number"
                              min={0}
                              step={0.01}
                              style={{ maxWidth: "6rem", padding: "0.25rem 0.4rem" }}
                              value={payEditHourly}
                              onChange={(e) => setPayEditHourly(e.target.value)}
                              disabled={patchPaySettings.isPending}
                              aria-label="Hourly rate"
                            />
                          )}
                          <div style={{ display: "flex", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="btn btn-gold btn-sm"
                              disabled={patchPaySettings.isPending}
                              onClick={() => {
                                if (u.role === "streamer") {
                                  const pct = Number(payEditCommission);
                                  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
                                  patchPaySettings.mutate({ id: u.id, commissionPercent: pct });
                                } else {
                                  const hr = Number(payEditHourly);
                                  if (!Number.isFinite(hr) || hr < 0) return;
                                  patchPaySettings.mutate({ id: u.id, hourlyRate: hr });
                                }
                              }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={patchPaySettings.isPending}
                              onClick={() => setPayEditId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                          <span>{payLabel(u)}</span>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={patchPaySettings.isPending}
                            onClick={() => {
                              setPayEditId(u.id);
                              setPayEditCommission(String(Number(u.commission_percent ?? 0)));
                              setPayEditHourly(String(Number(u.hourly_rate ?? 0)));
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{loginBadge(u)}</td>
                    <td>
                      {isActive ? (
                        <span className="badge badge-morning">Active</span>
                      ) : (
                        <span className="badge badge-evening">Inactive</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                      {u.deactivated_at ? new Date(u.deactivated_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      {isActive ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={deactivateUser.isPending || reactivateUser.isPending || isSelf}
                          title={isSelf ? "You cannot deactivate your own account" : undefined}
                          onClick={() => {
                            if (!confirm(`Deactivate ${u.display_name?.trim() || u.email}?`)) return;
                            deactivateUser.mutate(u.id);
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={reactivateUser.isPending || deactivateUser.isPending || purgeUser.isPending}
                            onClick={() => reactivateUser.mutate(u.id)}
                          >
                            Reactivate
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={reactivateUser.isPending || deactivateUser.isPending || purgeUser.isPending}
                            onClick={() => {
                              setPurgeTarget(u);
                              setPurgeConfirm("");
                            }}
                          >
                            Remove from app
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {deactivateUser.error ? <p className="error">{(deactivateUser.error as Error).message}</p> : null}
      {reactivateUser.error ? <p className="error">{(reactivateUser.error as Error).message}</p> : null}
      {patchPaySettings.error ? <p className="error">{(patchPaySettings.error as Error).message}</p> : null}

      {purgeTarget ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            zIndex: 9600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
          }}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !purgeUser.isPending) {
              setPurgeTarget(null);
              setPurgeConfirm("");
            }
          }}
        >
          <div
            className="card"
            style={{ maxWidth: 440, width: "100%" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="purge-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="purge-dialog-title" style={{ fontFamily: '"Playfair Display", serif', marginBottom: "0.75rem" }}>
              Remove from app
            </h3>
            <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }}>
              This removes{" "}
              <strong style={{ color: "var(--text)" }}>
                {purgeTarget.display_name?.trim() || purgeTarget.email}
              </strong>{" "}
              from the user list and blocks sign-in. Streams, sales, schedules, and other data they entered are not
              deleted.
            </p>
            <label className="form-label" htmlFor="purge-confirm-input">
              Type <strong style={{ color: "var(--gold)" }}>delete</strong> to confirm
            </label>
            <input
              id="purge-confirm-input"
              className="form-input"
              style={{ marginBottom: "1rem" }}
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="delete"
              autoComplete="off"
              disabled={purgeUser.isPending}
            />
            {purgeUser.error ? <p className="error">{(purgeUser.error as Error).message}</p> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={purgeUser.isPending}
                onClick={() => {
                  setPurgeTarget(null);
                  setPurgeConfirm("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={purgeConfirm.trim() !== "delete" || purgeUser.isPending}
                onClick={() => purgeUser.mutate({ id: purgeTarget.id, confirm: purgeConfirm.trim() })}
              >
                Confirm removal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
