import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
export function AdminUsersPage() {
    const qc = useQueryClient();
    const { profile } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [role, setRole] = useState("streamer");
    const [payStructure, setPayStructure] = useState("commission");
    const [commissionPercent, setCommissionPercent] = useState("10");
    const [hourlyRate, setHourlyRate] = useState("15");
    const [requiresLogin, setRequiresLogin] = useState(true);
    useEffect(() => {
        if (role === "admin")
            setRequiresLogin(true);
        if (role === "shipper" || role === "bagger")
            setRequiresLogin(false);
    }, [role]);
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users")
    });
    const createUser = useMutation({
        mutationFn: () => {
            const pct = Number(commissionPercent);
            const hr = Number(hourlyRate);
            const body = {
                displayName: displayName.trim() || undefined,
                role,
                payStructure,
                commissionPercent: payStructure === "commission" && Number.isFinite(pct) ? pct : 0,
                hourlyRate: payStructure === "hourly" && Number.isFinite(hr) ? hr : 0,
                requiresLogin
            };
            if (requiresLogin) {
                body.email = email.trim();
                body.password = password;
            }
            return api("/v1/auth/register", {
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
            setPayStructure("commission");
            setCommissionPercent("10");
            setHourlyRate("15");
            setRequiresLogin(true);
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
    const [payEditId, setPayEditId] = useState(null);
    const [payEditStructure, setPayEditStructure] = useState("commission");
    const [payEditCommission, setPayEditCommission] = useState("");
    const [payEditHourly, setPayEditHourly] = useState("");
    const patchPaySettings = useMutation({
        mutationFn: (args) => api(`/v1/admin/users/${args.id}/pay-settings`, {
            method: "PATCH",
            body: JSON.stringify({
                payStructure: args.payStructure,
                commissionPercent: args.commissionPercent,
                hourlyRate: args.hourlyRate
            })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            setPayEditId(null);
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
        if (!displayName.trim())
            return;
        if (requiresLogin) {
            if (!email.trim() || !password.trim())
                return;
        }
        createUser.mutate();
    };
    const canLoginRow = (u) => Boolean(u.requires_login) && (u.role === "admin" || u.role === "streamer");
    const accountLabel = (u) => {
        if (!canLoginRow(u))
            return "—";
        if (u.email.includes("@internal.invalid"))
            return "—";
        return u.email;
    };
    const payLabel = (u) => u.pay_structure === "hourly"
        ? `$${Number(u.hourly_rate ?? 0).toFixed(2)}/hr`
        : `${Number(u.commission_percent ?? 0).toFixed(1)}%`;
    const loginBadge = (u) => canLoginRow(u) ? (_jsx("span", { className: "badge badge-morning", children: "Yes" })) : (_jsx("span", { className: "badge badge-evening", children: "No" }));
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "User Management" }), users.error ? _jsx("p", { className: "error", children: users.error.message }) : null, _jsxs("div", { className: "card", style: { marginBottom: "1.5rem", padding: "1.2rem", background: "var(--slate)" }, children: [_jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "CREATE USER" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "grid-form", style: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 200, flex: "1 1 200px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-display-name", children: "Display name" }), _jsx("input", { id: "au-display-name", className: "form-input", value: displayName, onChange: (e) => setDisplayName(e.target.value), placeholder: "Full name" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 140 }, children: [_jsx("label", { className: "form-label", htmlFor: "au-role", children: "Role" }), _jsxs("select", { id: "au-role", className: "form-input", value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "streamer", children: "Streamer" }), _jsx("option", { value: "admin", children: "Admin" }), _jsx("option", { value: "shipper", children: "Shipper" }), _jsx("option", { value: "bagger", children: "Bagger" })] })] }), _jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "1 1 220px" }, children: [_jsx("span", { className: "form-label", children: "Pay structure" }), _jsxs("div", { style: { display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.35rem" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem" }, children: [_jsx("input", { type: "radio", name: "au-pay", checked: payStructure === "commission", onChange: () => setPayStructure("commission") }), "Commission (%)"] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem" }, children: [_jsx("input", { type: "radio", name: "au-pay", checked: payStructure === "hourly", onChange: () => setPayStructure("hourly") }), "Hourly ($/hr)"] })] })] }), payStructure === "commission" ? (_jsxs("div", { className: "form-group", style: { minWidth: 100 }, children: [_jsx("label", { className: "form-label", htmlFor: "au-commission", children: "%" }), _jsx("input", { id: "au-commission", className: "form-input", type: "number", min: 0, max: 100, step: 0.1, value: commissionPercent, onChange: (e) => setCommissionPercent(e.target.value) })] })) : (_jsxs("div", { className: "form-group", style: { minWidth: 100 }, children: [_jsx("label", { className: "form-label", htmlFor: "au-hourly", children: "Rate" }), _jsx("input", { id: "au-hourly", className: "form-input", type: "number", min: 0, step: 0.01, value: hourlyRate, onChange: (e) => setHourlyRate(e.target.value) })] }))] }), _jsxs("div", { style: { marginBottom: "0.75rem" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }, children: [_jsx("input", { type: "checkbox", checked: requiresLogin, disabled: role === "admin" || role === "shipper" || role === "bagger", onChange: (e) => setRequiresLogin(e.target.checked) }), "Requires app login (email + password)"] }), role === "admin" ? (_jsx("p", { style: { fontSize: "0.62rem", color: "var(--muted)", margin: "0.35rem 0 0" }, children: "Admins must always have login credentials." })) : null, role === "shipper" || role === "bagger" ? (_jsx("p", { style: { fontSize: "0.62rem", color: "var(--muted)", margin: "0.35rem 0 0" }, children: "Shippers and baggers are payroll-only and cannot sign in." })) : null] }), requiresLogin ? (_jsxs("div", { className: "grid-form", style: { display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem" }, children: [_jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "2 1 240px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-email", children: "Email" }), _jsx("input", { id: "au-email", className: "form-input", type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "user@example.com", autoComplete: "off" })] }), _jsxs("div", { className: "form-group", style: { minWidth: 220, flex: "2 1 220px" }, children: [_jsx("label", { className: "form-label", htmlFor: "au-password", children: "Password" }), _jsx("input", { id: "au-password", className: "form-input", type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "At least 8 characters", autoComplete: "new-password" })] })] })) : null, _jsx("button", { type: "submit", className: "btn btn-gold", disabled: createUser.isPending, children: "Create user" }), createUser.error ? _jsx("p", { className: "error", children: createUser.error.message }) : null] })] }), _jsx("div", { style: { fontSize: "0.65rem", letterSpacing: "0.12em", color: "var(--muted)", marginBottom: "0.75rem" }, children: "USERS" }), _jsx("div", { className: "tbl-wrap", children: _jsxs("table", { className: "tbl", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Name" }), _jsx("th", { children: "Account" }), _jsx("th", { children: "Role" }), _jsx("th", { children: "Pay" }), _jsx("th", { children: "Login" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Deactivated" }), _jsx("th", {})] }) }), _jsx("tbody", { children: (users.data ?? []).length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "tbl-empty", children: "No users found" }) })) : ((users.data ?? []).map((u) => {
                                const isActive = Boolean(u.is_active);
                                const isSelf = u.id === profile?.id;
                                return (_jsxs("tr", { children: [_jsx("td", { className: "tbl-gold", children: u.display_name?.trim() || "—" }), _jsx("td", { style: { fontSize: "0.72rem" }, children: accountLabel(u) }), _jsx("td", { children: u.role }), _jsx("td", { style: { minWidth: "10rem", fontSize: "0.7rem" }, children: payEditId === u.id ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.35rem" }, children: [_jsxs("select", { className: "form-input", style: { padding: "0.25rem 0.4rem" }, value: payEditStructure, onChange: (e) => setPayEditStructure(e.target.value), disabled: patchPaySettings.isPending, children: [_jsx("option", { value: "commission", children: "Commission" }), _jsx("option", { value: "hourly", children: "Hourly" })] }), payEditStructure === "commission" ? (_jsx("input", { className: "form-input", type: "number", min: 0, max: 100, step: 0.1, style: { maxWidth: "6rem", padding: "0.25rem 0.4rem" }, value: payEditCommission, onChange: (e) => setPayEditCommission(e.target.value), disabled: patchPaySettings.isPending })) : (_jsx("input", { className: "form-input", type: "number", min: 0, step: 0.01, style: { maxWidth: "6rem", padding: "0.25rem 0.4rem" }, value: payEditHourly, onChange: (e) => setPayEditHourly(e.target.value), disabled: patchPaySettings.isPending })), _jsxs("div", { style: { display: "flex", gap: "0.35rem" }, children: [_jsx("button", { type: "button", className: "btn btn-gold btn-sm", disabled: patchPaySettings.isPending, onClick: () => {
                                                                    const pct = Number(payEditCommission);
                                                                    const hr = Number(payEditHourly);
                                                                    if (payEditStructure === "commission" && (!Number.isFinite(pct) || pct < 0 || pct > 100))
                                                                        return;
                                                                    if (payEditStructure === "hourly" && (!Number.isFinite(hr) || hr < 0))
                                                                        return;
                                                                    patchPaySettings.mutate({
                                                                        id: u.id,
                                                                        payStructure: payEditStructure,
                                                                        commissionPercent: payEditStructure === "commission" ? pct : 0,
                                                                        hourlyRate: payEditStructure === "hourly" ? hr : 0
                                                                    });
                                                                }, children: "Save" }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: patchPaySettings.isPending, onClick: () => setPayEditId(null), children: "Cancel" })] })] })) : (_jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }, children: [_jsx("span", { children: payLabel(u) }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: patchPaySettings.isPending, onClick: () => {
                                                            setPayEditId(u.id);
                                                            setPayEditStructure(u.pay_structure === "hourly" ? "hourly" : "commission");
                                                            setPayEditCommission(String(Number(u.commission_percent ?? 0)));
                                                            setPayEditHourly(String(Number(u.hourly_rate ?? 0)));
                                                        }, children: "Edit" })] })) }), _jsx("td", { children: loginBadge(u) }), _jsx("td", { children: isActive ? (_jsx("span", { className: "badge badge-morning", children: "Active" })) : (_jsx("span", { className: "badge badge-evening", children: "Inactive" })) }), _jsx("td", { style: { fontSize: "0.65rem", color: "var(--muted)" }, children: u.deactivated_at ? new Date(u.deactivated_at).toLocaleString() : "—" }), _jsx("td", { children: isActive ? (_jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: deactivateUser.isPending || reactivateUser.isPending || isSelf, title: isSelf ? "You cannot deactivate your own account" : undefined, onClick: () => {
                                                    if (!confirm(`Deactivate ${u.display_name?.trim() || u.email}?`))
                                                        return;
                                                    deactivateUser.mutate(u.id);
                                                }, children: "Deactivate" })) : (_jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }, children: [_jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: reactivateUser.isPending || deactivateUser.isPending || purgeUser.isPending, onClick: () => reactivateUser.mutate(u.id), children: "Reactivate" }), _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: reactivateUser.isPending || deactivateUser.isPending || purgeUser.isPending, onClick: () => {
                                                            setPurgeTarget(u);
                                                            setPurgeConfirm("");
                                                        }, children: "Remove from app" })] })) })] }, u.id));
                            })) })] }) }), deactivateUser.error ? _jsx("p", { className: "error", children: deactivateUser.error.message }) : null, reactivateUser.error ? _jsx("p", { className: "error", children: reactivateUser.error.message }) : null, patchPaySettings.error ? _jsx("p", { className: "error", children: patchPaySettings.error.message }) : null, purgeTarget ? (_jsx("div", { style: {
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
                }, children: _jsxs("div", { className: "card", style: { maxWidth: 440, width: "100%" }, role: "dialog", "aria-modal": "true", "aria-labelledby": "purge-dialog-title", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { id: "purge-dialog-title", style: { fontFamily: '"Playfair Display", serif', marginBottom: "0.75rem" }, children: "Remove from app" }), _jsxs("p", { style: { fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: "1rem", lineHeight: 1.5 }, children: ["This removes", " ", _jsx("strong", { style: { color: "var(--text)" }, children: purgeTarget.display_name?.trim() || purgeTarget.email }), " ", "from the user list and blocks sign-in. Streams, sales, schedules, and other data they entered are not deleted."] }), _jsxs("label", { className: "form-label", htmlFor: "purge-confirm-input", children: ["Type ", _jsx("strong", { style: { color: "var(--gold)" }, children: "delete" }), " to confirm"] }), _jsx("input", { id: "purge-confirm-input", className: "form-input", style: { marginBottom: "1rem" }, value: purgeConfirm, onChange: (e) => setPurgeConfirm(e.target.value), placeholder: "delete", autoComplete: "off", disabled: purgeUser.isPending }), purgeUser.error ? _jsx("p", { className: "error", children: purgeUser.error.message }) : null, _jsxs("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }, children: [_jsx("button", { type: "button", className: "btn btn-outline btn-sm", disabled: purgeUser.isPending, onClick: () => {
                                        setPurgeTarget(null);
                                        setPurgeConfirm("");
                                    }, children: "Cancel" }), _jsx("button", { type: "button", className: "btn btn-danger btn-sm", disabled: purgeConfirm.trim() !== "delete" || purgeUser.isPending, onClick: () => purgeUser.mutate({ id: purgeTarget.id, confirm: purgeConfirm.trim() }), children: "Confirm removal" })] })] }) })) : null] }));
}
