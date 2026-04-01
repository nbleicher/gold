import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
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
    const qc = useQueryClient();
    const [weekOffset, setWeekOffset] = useState(0);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formDate, setFormDate] = useState("");
    const [formTime, setFormTime] = useState("09:00");
    const [formStreamer, setFormStreamer] = useState("");
    const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
    const from = localYmd(weekDates[0]);
    const to = localYmd(weekDates[6]);
    const todayY = localYmd(new Date());
    const users = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => api("/v1/admin/users")
    });
    const schedules = useQuery({
        queryKey: ["admin-schedules", from, to],
        queryFn: () => api(`/v1/admin/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    });
    const byDate = useMemo(() => {
        const m = new Map();
        for (const s of schedules.data ?? []) {
            const list = m.get(s.date) ?? [];
            list.push(s);
            m.set(s.date, list);
        }
        for (const [, list] of m) {
            list.sort((a, b) => a.start_time.localeCompare(b.start_time));
        }
        return m;
    }, [schedules.data]);
    const createMut = useMutation({
        mutationFn: () => api("/v1/admin/schedules", {
            method: "POST",
            body: JSON.stringify({ date: formDate, startTime: formTime, streamerId: formStreamer })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-schedules"] });
            closeModal();
        }
    });
    const patchMut = useMutation({
        mutationFn: () => api(`/v1/admin/schedules/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify({ date: formDate, startTime: formTime, streamerId: formStreamer })
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["admin-schedules"] });
            closeModal();
        }
    });
    const deleteMut = useMutation({
        mutationFn: (id) => api(`/v1/admin/schedules/${id}`, { method: "DELETE" }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-schedules"] })
    });
    const closeModal = () => {
        setModalOpen(false);
        setEditingId(null);
    };
    const openAdd = (dateKey) => {
        const u = users.data ?? [];
        if (!u.length) {
            alert("Add users first.");
            return;
        }
        setEditingId(null);
        setFormDate(dateKey);
        setFormTime("09:00");
        setFormStreamer(u[0].id);
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
        if (!formDate || !formTime || !formStreamer)
            return;
        if (editingId)
            patchMut.mutate();
        else
            createMut.mutate();
    };
    const userLabel = (u) => u.display_name?.trim() || u.email;
    const slotHost = (s) => s.streamer_display_name?.trim() || s.streamer_email;
    const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const pending = createMut.isPending || patchMut.isPending;
    const mutError = createMut.error ?? patchMut.error;
    return (_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Schedule" }), _jsx("p", { className: "pg-sub", style: { marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }, children: "Weekly stream schedule" }), users.error || schedules.error ? (_jsx("p", { className: "error", children: String((users.error ?? schedules.error)) })) : null, _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }, children: [_jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setWeekOffset((w) => w - 1), children: "\u25C0 Prev" }), _jsx("span", { style: { flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-dim)" }, children: weekLabel }), _jsx("button", { type: "button", className: "btn btn-outline", onClick: () => setWeekOffset((w) => w + 1), children: "Next \u25B6" })] }), _jsx("div", { style: {
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
                                                }, children: "Stream" }), _jsx("div", { style: { fontSize: "0.72rem", color: "var(--gold-light)", marginBottom: "0.2rem" }, children: s.start_time }), _jsxs("div", { style: { fontSize: "0.62rem", color: "var(--text-dim)" }, children: ["Host: ", slotHost(s)] }), _jsxs("div", { style: { display: "flex", gap: "0.35rem", marginTop: "0.45rem" }, children: [_jsx("button", { type: "button", className: "btn btn-outline btn-sm", onClick: () => openEdit(s), children: "Edit" }), _jsx("button", { type: "button", className: "btn btn-danger btn-sm", onClick: () => {
                                                            if (confirm("Delete this stream card?"))
                                                                deleteMut.mutate(s.id);
                                                        }, children: "\u2715" })] })] }, s.id)))), _jsx("button", { type: "button", className: "btn btn-outline btn-sm", style: { width: "100%" }, onClick: () => openAdd(key), children: "+ Add stream" })] })] }, key));
                }) }), _jsx("div", { className: `modal-overlay${modalOpen ? " open" : ""}`, role: "presentation", onClick: (e) => e.target === e.currentTarget && closeModal(), children: _jsxs("div", { className: "modal", children: [_jsx("button", { type: "button", className: "modal-close", onClick: closeModal, "aria-label": "Close", children: "\u2715" }), _jsx("div", { className: "modal-title", children: editingId ? "Edit scheduled stream" : "Add scheduled stream" }), _jsxs("form", { onSubmit: onSubmit, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "sc-date", children: "Date" }), _jsx("input", { id: "sc-date", className: "form-input", type: "date", value: formDate, onChange: (e) => setFormDate(e.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "sc-time", children: "Start time" }), _jsx("input", { id: "sc-time", className: "form-input", type: "time", value: formTime, onChange: (e) => setFormTime(e.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { className: "form-label", htmlFor: "sc-streamer", children: "Streamer" }), _jsx("select", { id: "sc-streamer", className: "form-input", value: formStreamer, onChange: (e) => setFormStreamer(e.target.value), children: (users.data ?? []).map((u) => (_jsx("option", { value: u.id, children: userLabel(u) }, u.id))) })] }), mutError ? _jsx("p", { className: "error", children: mutError.message }) : null, _jsxs("div", { className: "modal-actions", children: [_jsx("button", { type: "button", className: "btn btn-outline", onClick: closeModal, children: "Cancel" }), _jsx("button", { type: "submit", className: "btn btn-gold", disabled: pending, children: "Save" })] })] })] }) })] }));
}
