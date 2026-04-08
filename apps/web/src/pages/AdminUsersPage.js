import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
export function AdminUsersPage() {
    const qc = useQueryClient();
    const { profile } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState("user");
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users")
    });
    const createUser = useMutation({
        mutationFn: () => api("/v1/auth/register", {
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
        mutationFn: (id) => api(`/v1/admin/users/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] })
    });
    const reactivateUser = useMutation({
        mutationFn: (id) => api(`/v1/admin/users/${id}/reactivate`, { method: "PATCH" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] })
    });
    const onSubmit = (e) => {
        e.preventDefault();
        if (!email.trim() || !password.trim())
            return;
        createUser.mutate();
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "User Management" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "Create users, assign roles, and deactivate accounts while preserving historical records." }), users.error ? _jsx("p", { className: "error", children: users.error.message }) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "CREATE USER" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "grid-form", style: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "2 1 240px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-email", children: "Email" }), _jsx("input", { id: "au-email", className: "form-input", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "user@example.com", autoComplete: "off" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "2 1 220px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-password", children: "Password" }), _jsx("input", { id: "au-password", className: "form-input", type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Set initial password", autoComplete: "new-password" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 180, flex: "2 1 180px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-display-name", children: "Display name (optional)" }), _jsx("input", { id: "au-display-name", className: "form-input", value: displayName, onChange: (e) => setDisplayName(e.target.value), placeholder: "Full name" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", htmlFor: "au-role", children: "Role" }), _jsxs("select", { id: "au-role", className: "form-input", value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "user", children: "User" }), _jsx("option", { value: "admin", children: "Admin" })] })] }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: createUser.isPending, children: "Create user" })] }), createUser.error ? _jsx("p", { className: "error", children: createUser.error.message }) : null] })] }), _jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "USERS" }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Deactivated" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (users.data ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "tbl-empty", children: "No users found" }) })) : ((users.data ?? []).map((u) => {
                                const isActive = Boolean(u.is_active);
                                const isSelf = u.id === profile?.id;
                                return (_jsxs("tr", { children: [_jsx("td", { className: "tbl-gold", children: u.display_name?.trim() || "—" }), _jsx("td", { children: u.email }), _jsx("td", { children: u.role }), _jsx("td", { children: isActive ? (_jsx("span", { className: "badge badge-morning", children: "Active" })) : (_jsx("span", { className: "badge badge-evening", children: "Inactive" })) }), _jsx("td", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: u.deactivated_at ? new Date(u.deactivated_at).toLocaleString() : "—" }), _jsx("td", { children: isActive ? (_jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: deactivateUser.isPending || reactivateUser.isPending || isSelf, title: isSelf ? "You cannot deactivate your own account" : undefined, onClick: () => {
                                                    if (!confirm(`Deactivate ${u.email}?`))
                                                        return;
                                                    deactivateUser.mutate(u.id);
                                                }, children: "Deactivate" })) : (_jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: reactivateUser.isPending || deactivateUser.isPending, onClick: () => reactivateUser.mutate(u.id), children: "Reactivate" })) })] }, u.id));
                            })) })] }) }), deactivateUser.error ? _jsx("p", { className: "error", children: deactivateUser.error.message }) : null, reactivateUser.error ? _jsx("p", { className: "error", children: reactivateUser.error.message }) : null] }));
}
