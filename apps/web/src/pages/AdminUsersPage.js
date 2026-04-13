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
    const [purgeTarget, setPurgeTarget] = useState(null);
    const [purgeConfirm, setPurgeConfirm] = useState("");
    const [commissionEditId, setCommissionEditId] = useState(null);
    const [commissionDraft, setCommissionDraft] = useState("");
    const patchCommission = useMutation({
        mutationFn: ({ id, commissionPercent }) => api(`/v1/admin/users/${id}/commission`, {
            method: "PATCH",
            body: JSON.stringify({ commissionPercent })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            setCommissionEditId(null);
            setCommissionDraft("");
        }
    });
    const purgeUser = useMutation({
        mutationFn: ({ id, confirm }) => api(`/v1/admin/users/${id}/purge-from-app`, {
            method: "POST",
            body: JSON.stringify({ confirm })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            setPurgeTarget(null);
            setPurgeConfirm("");
        }
    });
    const onSubmit = (e) => {
        e.preventDefault();
        if (!email.trim() || !password.trim())
            return;
        createUser.mutate();
    };
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "User Management" }), users.error ? _jsx("p", { className: "error", children: users.error.message }) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "CREATE USER" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "grid-form", style: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "2 1 240px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-email", children: "Email" }), _jsx("input", { id: "au-email", className: "form-input", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "user@example.com", autoComplete: "off" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "2 1 220px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-password", children: "Password" }), _jsx("input", { id: "au-password", className: "form-input", type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Set initial password", autoComplete: "new-password" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 180, flex: "2 1 180px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-display-name", children: "Display name (optional)" }), _jsx("input", { id: "au-display-name", className: "form-input", value: displayName, onChange: (e) => setDisplayName(e.target.value), placeholder: "Full name" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", htmlFor: "au-role", children: "Role" }), _jsxs("select", { id: "au-role", className: "form-input", value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "user", children: "User" }), _jsx("option", { value: "admin", children: "Admin" })] })] }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: createUser.isPending, children: "Create user" })] }), createUser.error ? _jsx("p", { className: "error", children: createUser.error.message }) : null] })] }), _jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "USERS" }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Email" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Commission %" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Deactivated" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (users.data ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "tbl-empty", children: "No users found" }) })) : ((users.data ?? []).map((u) => {
                                const isActive = Boolean(u.is_active);
                                const isSelf = u.id === profile?.id;
                                const pct = Number(u.commission_percent ?? 0);
                                const pctDisplay = Number.isFinite(pct) ? pct : 0;
                                return (_jsxs("tr", { children: [_jsx("td", { className: "tbl-gold", children: u.display_name?.trim() || "—" }), _jsx("td", { children: u.email }), _jsx("td", { children: u.role }), _jsx("td", { style: { minWidth: "9rem", fontSize: "0.7rem" }, children: commissionEditId === u.id ? (_jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }, children: [_jsx("input", { className: "form-input", type: "number", min: 0, max: 100, step: 0.1, style: { maxWidth: "5rem", padding: "0.25rem 0.4rem" }, value: commissionDraft, onChange: (e) => setCommissionDraft(e.target.value), disabled: patchCommission.isPending }), _jsx("button", { type: "button", className: "btn btn-gold btn-sm", disabled: patchCommission.isPending, onClick: () => {
                                                            const n = Number(commissionDraft);
                                                            if (!Number.isFinite(n) || n < 0 || n > 100)
                                                                return;
                                                            patchCommission.mutate({ id: u.id, commissionPercent: n });
                                                        }, children: "Save" }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: patchCommission.isPending, onClick: () => {
                                                            setCommissionEditId(null);
                                                            setCommissionDraft("");
                                                        }, children: "Cancel" })] })) : (_jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }, children: [_jsxs("span", { children: [pctDisplay.toFixed(1), "%"] }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: patchCommission.isPending, onClick: () => {
                                                            setCommissionEditId(u.id);
                                                            setCommissionDraft(String(pctDisplay));
                                                        }, children: "Edit" })] })) }), _jsx("td", { children: isActive ? (_jsx("span", { className: "badge badge-morning", children: "Active" })) : (_jsx("span", { className: "badge badge-evening", children: "Inactive" })) }), _jsx("td", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: u.deactivated_at ? new Date(u.deactivated_at).toLocaleString() : "—" }), _jsx("td", { children: isActive ? (_jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: deactivateUser.isPending || reactivateUser.isPending || isSelf, title: isSelf ? "You cannot deactivate your own account" : undefined, onClick: () => {
                                                    if (!confirm(`Deactivate ${u.email}?`))
                                                        return;
                                                    deactivateUser.mutate(u.id);
                                                }, children: "Deactivate" })) : (_jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }, children: [_jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: reactivateUser.isPending ||
                                                            deactivateUser.isPending ||
                                                            purgeUser.isPending, onClick: () => reactivateUser.mutate(u.id), children: "Reactivate" }), _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: reactivateUser.isPending ||
                                                            deactivateUser.isPending ||
                                                            purgeUser.isPending, onClick: () => {
                                                            setPurgeTarget(u);
                                                            setPurgeConfirm("");
                                                        }, children: "Remove from app" })] })) })] }, u.id));
                            })) })] }) }), deactivateUser.error ? _jsx("p", { className: "error", children: deactivateUser.error.message }) : null, reactivateUser.error ? _jsx("p", { className: "error", children: reactivateUser.error.message }) : null, patchCommission.error ? _jsx("p", { className: "error", children: patchCommission.error.message }) : null, purgeTarget ? (_jsx("div", { style: {
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.65)",
                    zIndex: 9600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem"
                }, role: "presentation", onClick: (e) => {
                    if (e.target === e.currentTarget && !purgeUser.isPending) {
                        setPurgeTarget(null);
                        setPurgeConfirm("");
                    }
                }, children: _jsxs("div", { className: "card", style: { maxWidth: 440, width: "100%" }, role: "dialog", "aria-modal": "true", "aria-labelledby": "purge-dialog-title", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { id: "purge-dialog-title", style: { fontFamily: '"Playfair Display", serif', marginBottom: "0.75rem" }, children: "Remove from app" }), _jsxs("p", { style: { fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }, children: ["This removes ", _jsx("strong", { style: { color: "var(--text)" }, children: purgeTarget.email }), " from the user list and blocks sign-in. Streams, sales, schedules, and other data they entered are not deleted."] }), _jsxs("label", { className: "form-label", htmlFor: "purge-confirm-input", children: ["Type ", _jsx("strong", { style: { color: "var(--gold)" }, children: "delete" }), " to confirm"] }), _jsx("input", { id: "purge-confirm-input", className: "form-input", style: { marginBottom: "1rem" }, value: purgeConfirm, onChange: (e) => setPurgeConfirm(e.target.value), placeholder: "delete", autoComplete: "off", disabled: purgeUser.isPending }), purgeUser.error ? _jsx("p", { className: "error", children: purgeUser.error.message }) : null, _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }, children: [_jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: purgeUser.isPending, onClick: () => {
                                        setPurgeTarget(null);
                                        setPurgeConfirm("");
                                    }, children: "Cancel" }), _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: purgeConfirm.trim() !== "delete" || purgeUser.isPending, onClick: () => purgeUser.mutate({ id: purgeTarget.id, confirm: purgeConfirm.trim() }), children: "Confirm removal" })] })] }) })) : null] }));
}
