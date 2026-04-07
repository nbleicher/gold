import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "user";
  is_active: number;
  deactivated_at: string | null;
  deactivated_by: string | null;
};

export function AdminUsersPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users")
  });

  const createUser = useMutation({
    mutationFn: () =>
      api<{ id: string; role: "admin" | "user"; displayName: string | null }>("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          role
        })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("user");
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    createUser.mutate();
  };

  return (
    <section className="card">
      <h2>User Management</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Create users, assign roles, and deactivate accounts while preserving historical records.
      </p>

      {users.error ? <p className="error">{(users.error as Error).message}</p> : null}

      <div className="card" style={{ marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }}>
        <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }}>
          CREATE USER
        </div>
        <form onSubmit={onSubmit}>
          <div className="grid-form" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
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
                placeholder="Set initial password"
                autoComplete="new-password"
              />
            </div>
            <div className="form-group" style={{ minWidth: 180, flex: "2 1 180px" }}>
              <label className="form-label" htmlFor="au-display-name">
                Display name (optional)
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
                onChange={(e) => setRole(e.target.value as "admin" | "user")}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn btn-gold" disabled={createUser.isPending}>
              Create user
            </button>
          </div>
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
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Deactivated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="tbl-empty">
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
                    <td>{u.email}</td>
                    <td>{u.role}</td>
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
                            if (!confirm(`Deactivate ${u.email}?`)) return;
                            deactivateUser.mutate(u.id);
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={reactivateUser.isPending || deactivateUser.isPending}
                          onClick={() => reactivateUser.mutate(u.id)}
                        >
                          Reactivate
                        </button>
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
    </section>
  );
}
