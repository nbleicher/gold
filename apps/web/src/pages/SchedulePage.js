import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
function localYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
function getWeekDates(weekOffset) {
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
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function SchedulePage() {
    const { profile } = useAuth();
    const isAdmin = profile?.role === "admin";
    const qc = useQueryClient();
    const [weekOffset, setWeekOffset] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formDate, setFormDate] = useState("");
    const [formTime, setFormTime] = useState("09:00");
    const [formStreamer, setFormStreamer] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
    const from = localYmd(weekDates[0]);
    const to = localYmd(weekDates[6]);
    const todayY = localYmd(new Date());
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users"),
        enabled: isAdmin
    });
    const schedules = useQuery({
        queryKey: [isAdmin ? "admin-schedules" : "my-schedules", from, to, statusFilter],
        queryFn: () => isAdmin
            ? api(`/v1/admin/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${statusFilter === "all" ? "" : `&status=${statusFilter}`}`)
            : api(`/v1/schedules/mine?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    });
    const byDate = useMemo(() => {
        const m = new Map();
        for (const s of (schedules.data ?? [])) {
            const list = m.get(s.date) ?? [];
            list.push(s);
            m.set(s.date, list);
        }
        for (const [, list] of m) {
            list.sort((a, b) => {
                const byTime = a.start_time.localeCompare(b.start_time);
                if (byTime !== 0)
                    return byTime;
                const at = a.pending_submitted_at ?? a.created_at;
                const bt = b.pending_submitted_at ?? b.created_at;
                return bt.localeCompare(at);
            });
        }
        return m;
    }, [schedules.data]);
    const createMut = useMutation({
        mutationFn: () => api(isAdmin ? "/v1/admin/schedules" : "/v1/schedules/mine", {
            method: "POST",
            body: JSON.stringify(isAdmin ? { date: formDate, startTime: formTime, streamerId: formStreamer } : { date: formDate, startTime: formTime })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [isAdmin ? "admin-schedules" : "my-schedules"] });
            closeModal();
        }
    });
    const patchMut = useMutation({
        mutationFn: () => api(isAdmin ? `/v1/admin/schedules/${editingId}` : `/v1/schedules/mine/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(isAdmin ? { date: formDate, startTime: formTime, streamerId: formStreamer } : { date: formDate, startTime: formTime })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [isAdmin ? "admin-schedules" : "my-schedules"] });
            closeModal();
        }
    });
    const deleteMut = useMutation({
        mutationFn: (id) => api(isAdmin ? `/v1/admin/schedules/${id}` : `/v1/schedules/mine/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: [isAdmin ? "admin-schedules" : "my-schedules"] })
    });
    const reviewMut = useMutation({
        mutationFn: ({ id, action }) => api(`/v1/admin/schedules/${id}/review`, {
            method: "PATCH",
            body: JSON.stringify({ action })
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-schedules"] })
    });
    const closeModal = () => {
        setModalOpen(false);
        setEditingId(null);
    };
    const openAdd = (dateKey) => {
        setEditingId(null);
        setFormDate(dateKey);
        setFormTime("09:00");
        if (isAdmin) {
            const u = users.data ?? [];
            if (!u.length) {
                alert("Add users first.");
                return;
            }
            setFormStreamer(u[0].id);
        }
        else {
            setFormStreamer(profile?.id ?? "");
        }
        setModalOpen(true);
    };
    const openEdit = (slot) => {
        setEditingId(slot.id);
        setFormDate(slot.date);
        setFormTime(slot.start_time.length >= 5 ? slot.start_time.slice(0, 5) : slot.start_time);
        setFormStreamer(slot.streamer_id);
        setModalOpen(true);
    };
    const onSubmit = (e) => {
        e.preventDefault();
        if (!formDate || !formTime || (isAdmin && !formStreamer))
            return;
        if (editingId)
            patchMut.mutate();
        else
            createMut.mutate();
    };
    const userLabel = (u) => u.display_name?.trim() || u.email;
    const slotHost = (s) => s.streamer_display_name?.trim() || s.streamer_email;
    const statusBadge = (status) => status === "approved"
        ? "badge badge-morning"
        : status === "pending"
            ? "badge badge-evening"
            : "badge";
    const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const pending = createMut.isPending || patchMut.isPending;
    const mutError = createMut.error ?? patchMut.error;
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Schedule" }), (isAdmin && users.error) || schedules.error ? (_jsx("p", { className: "error", children: String((users.error ?? schedules.error)) })) : null, isAdmin ? (_jsx("div", { style: { display: "flex", gap: "0.5rem", marginBottom: "1rem" }, children: ["all", "pending", "approved", "rejected"].map((s) => (_jsx("button", { type: "button", className: `btn ${statusFilter === s ? "btn-gold" : "btn-outline"} btn-sm`, onClick: () => setStatusFilter(s), children: s[0].toUpperCase() + s.slice(1) }, s))) })) : null, _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }, children: [_jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setWeekOffset((w) => w - 1), children: "\u25C0 Prev" }), _jsx("span", { style: { flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-dim)" }, children: weekLabel }), _jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setWeekOffset((w) => w + 1), children: "Next \u25B6" })] }), _jsx("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: "0.6rem"
                }, children: weekDates.map((date, i) => {
                    const key = localYmd(date);
                    const slots = byDate.get(key) ?? [];
                    const isToday = key === todayY;
                    return (_jsxs("div", { style: {
                            background: "var(--charcoal)",
                            border: `1px solid ${isToday ? "var(--gold)" : "var(--border)"}`,
                            borderRadius: 3,
                            overflow: "hidden"
                        }, children: [_jsxs("div", { style: {
                                    background: "var(--slate)",
                                    padding: "0.5rem 0.7rem",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    borderBottom: "1px solid var(--border)"
                                }, children: [_jsx("span", { style: { fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--muted)" }, children: DAY_LABELS[i] }), _jsx("span", { style: {
                                            fontFamily: '"Playfair Display", serif',
                                            fontSize: "1rem",
                                            color: isToday ? "var(--gold)" : "var(--gold-light)"
                                        }, children: date.getDate() })] }), _jsxs("div", { style: { padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }, children: [slots.length === 0 ? (_jsx("div", { style: {
                                            fontSize: "0.6rem",
                                            color: "var(--muted)",
                                            padding: "0.45rem 0.35rem",
                                            border: "1px dashed var(--border)",
                                            borderRadius: 2
                                        }, children: "No streams" })) : (slots.map((s) => (_jsxs("div", { style: {
                                            background: "rgba(139,105,20,0.07)",
                                            border: "1px solid var(--gold-dark)",
                                            borderRadius: 2,
                                            padding: "0.45rem"
                                        }, children: [_jsx("div", { style: {
                                                    fontSize: "0.52rem",
                                                    letterSpacing: "0.1em",
                                                    textTransform: "uppercase",
                                                    color: "var(--muted)",
                                                    marginBottom: "0.3rem"
                                                }, children: "Stream" }), _jsx("div", { style: { fontSize: "0.72rem", color: "var(--gold-light)", marginBottom: "0.2rem" }, children: s.start_time }), _jsxs("div", { style: { fontSize: "0.62rem", color: "var(--text-dim)" }, children: ["Host: ", slotHost(s)] }), _jsx("div", { style: { marginTop: "0.25rem" }, children: _jsx("span", { className: statusBadge(s.status), children: s.status }) }), s.status === "pending" && s.pending_submitted_at ? (_jsxs("div", { style: { fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.2rem" }, children: ["Submitted: ", new Date(s.pending_submitted_at).toLocaleString()] })) : null, s.status === "rejected" && s.review_note ? (_jsxs("div", { style: { fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.2rem" }, children: ["Note: ", s.review_note] })) : null, _jsxs("div", { style: { display: "flex", gap: "0.35rem", marginTop: "0.45rem", flexWrap: "wrap" }, children: [(isAdmin || s.status === "pending") ? (_jsx("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => openEdit(s), children: "Edit" })) : null, (isAdmin || s.status === "pending") ? (_jsx("button", { type: "button", className: "btn btn-danger btn-sm", onClick: () => {
                                                            if (confirm("Delete this stream card?"))
                                                                deleteMut.mutate(s.id);
                                                        }, children: "\u2715" })) : null, isAdmin && s.status === "pending" ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn btn-gold btn-sm", onClick: () => reviewMut.mutate({ id: s.id, action: "approve" }), children: "Approve" }), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => reviewMut.mutate({ id: s.id, action: "reject" }), children: "Reject" })] })) : null] })] }, s.id)))), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", style: { width: "100%" }, onClick: () => openAdd(key), children: isAdmin ? "+ Add stream" : "+ Request stream" })] })] }, key));
                }) }), _jsx("div", { className: `modal-overlay${modalOpen ? " open" : ""}`, role: "presentation", onClick: (e) => e.target === e.currentTarget && closeModal(), children: _jsxs("div", { className: "modal", children: [_jsx("button", { type: "button", className: "modal-close", onClick: closeModal, "aria-label": "Close", children: "\u2715" }), _jsx("div", { className: "modal-title", children: editingId ? "Edit scheduled stream" : isAdmin ? "Add scheduled stream" : "Request scheduled stream" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "sc-date", children: "Date" }), _jsx("input", { id: "sc-date", className: "form-input", type: "date", value: formDate, onChange: (e) => setFormDate(e.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "sc-time", children: "Start time" }), _jsx("input", { id: "sc-time", className: "form-input", type: "time", value: formTime, onChange: (e) => setFormTime(e.target.value) })] }), isAdmin ? (_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "sc-streamer", children: "Streamer" }), _jsx("select", { id: "sc-streamer", className: "form-input", value: formStreamer, onChange: (e) => setFormStreamer(e.target.value), children: (users.data ?? []).map((u) => (_jsx("option", { value: u.id, children: userLabel(u) }, u.id))) })] })) : null, mutError ? _jsx("p", { className: "error", children: mutError.message }) : null, reviewMut.error ? _jsx("p", { className: "error", children: reviewMut.error.message }) : null, _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "btn btn-outline", onClick: closeModal, children: "Cancel" }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: pending, children: isAdmin ? "Save" : "Submit" })] })] })] }) })] }));
}
