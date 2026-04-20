import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: number;
};
type ScheduleSlot = {
  id: string;
  date: string;
  start_time: string;
  streamer_id: string;
  created_at: string;
  entry_type?: string;
  hours_worked?: number | null;
  status: "pending" | "approved" | "rejected";
  pending_submitted_at: string | null;
  review_note: string | null;
  streamer_email: string;
  streamer_display_name: string | null;
};

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

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SchedulePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formStreamer, setFormStreamer] = useState("");
  const [formHours, setFormHours] = useState("8");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from = localYmd(weekDates[0]);
  const to = localYmd(weekDates[6]);
  const todayY = localYmd(new Date());

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users"),
    enabled: isAdmin
  });

  const scheduleAssignees = useMemo(
    () =>
      (users.data ?? []).filter(
        (u) =>
          Boolean(u.is_active) &&
          (u.role === "admin" || u.role === "streamer" || u.role === "shipper" || u.role === "bagger")
      ),
    [users.data]
  );

  const assignee = useMemo(() => (users.data ?? []).find((u) => u.id === formStreamer), [users.data, formStreamer]);

  const schedules = useQuery({
    queryKey: [isAdmin ? "admin-schedules" : "my-schedules", from, to, statusFilter],
    queryFn: () =>
      isAdmin
        ? api<ScheduleSlot[]>(
            `/v1/admin/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${
              statusFilter === "all" ? "" : `&status=${statusFilter}`
            }`
          )
        : api<ScheduleSlot[]>(`/v1/schedules/mine?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  });

  const editingSlot = useMemo(
    () => (schedules.data ?? []).find((s) => s.id === editingId) ?? null,
    [schedules.data, editingId]
  );

  const modalLaborMode = Boolean(
    editingId
      ? editingSlot?.entry_type === "labor"
      : assignee && (assignee.role === "shipper" || assignee.role === "bagger")
  );

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleSlot[]>();
    for (const s of (schedules.data ?? []) as ScheduleSlot[]) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => {
        const byTime = a.start_time.localeCompare(b.start_time);
        if (byTime !== 0) return byTime;
        const at = a.pending_submitted_at ?? a.created_at;
        const bt = b.pending_submitted_at ?? b.created_at;
        return bt.localeCompare(at);
      });
    }
    return m;
  }, [schedules.data]);

  const createMut = useMutation({
    mutationFn: () => {
      if (isAdmin) {
        const labor = assignee && (assignee.role === "shipper" || assignee.role === "bagger");
        if (labor) {
          const h = Number(formHours);
          if (!Number.isFinite(h) || h <= 0) throw new Error("Hours worked must be a positive number");
          return api<ScheduleSlot>("/v1/admin/schedules", {
            method: "POST",
            body: JSON.stringify({ date: formDate, streamerId: formStreamer, hoursWorked: h })
          });
        }
        return api<ScheduleSlot>("/v1/admin/schedules", {
          method: "POST",
          body: JSON.stringify({ date: formDate, startTime: formTime, streamerId: formStreamer })
        });
      }
      return api<ScheduleSlot>("/v1/schedules/mine", {
        method: "POST",
        body: JSON.stringify({ date: formDate, startTime: formTime })
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [isAdmin ? "admin-schedules" : "my-schedules"] });
      closeModal();
    }
  });

  const patchMut = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error("Nothing to edit");
      if (isAdmin) {
        if (editingSlot?.entry_type === "labor") {
          const h = Number(formHours);
          if (!Number.isFinite(h) || h <= 0) throw new Error("Hours worked must be a positive number");
          return api<ScheduleSlot>(`/v1/admin/schedules/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify({ date: formDate, streamerId: formStreamer, hoursWorked: h })
          });
        }
        return api<ScheduleSlot>(`/v1/admin/schedules/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ date: formDate, startTime: formTime, streamerId: formStreamer })
        });
      }
      return api<ScheduleSlot>(`/v1/schedules/mine/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ date: formDate, startTime: formTime })
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [isAdmin ? "admin-schedules" : "my-schedules"] });
      closeModal();
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(isAdmin ? `/v1/admin/schedules/${id}` : `/v1/schedules/mine/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [isAdmin ? "admin-schedules" : "my-schedules"] })
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api<{ ok: boolean }>(`/v1/admin/schedules/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-schedules"] })
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const openAdd = (dateKey: string) => {
    setEditingId(null);
    setFormDate(dateKey);
    setFormTime("09:00");
    setFormHours("8");
    if (isAdmin) {
      const u = scheduleAssignees;
      if (!u.length) {
        alert("Add a user (admin, streamer, shipper, or bagger) first.");
        return;
      }
      setFormStreamer(u[0].id);
    } else {
      setFormStreamer(profile?.id ?? "");
    }
    setModalOpen(true);
  };

  const openEdit = (slot: ScheduleSlot) => {
    setEditingId(slot.id);
    setFormDate(slot.date);
    setFormTime(slot.start_time.length >= 5 ? slot.start_time.slice(0, 5) : slot.start_time);
    setFormStreamer(slot.streamer_id);
    setFormHours(
      slot.entry_type === "labor" && slot.hours_worked != null ? String(slot.hours_worked) : "8"
    );
    setModalOpen(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formDate || (isAdmin && !formStreamer)) return;
    if (isAdmin && modalLaborMode) {
      const h = Number(formHours);
      if (!Number.isFinite(h) || h <= 0) return;
    } else if (!formTime) return;
    if (editingId) patchMut.mutate();
    else createMut.mutate();
  };

  const userLabel = (u: AdminUser) =>
    u.display_name?.trim() || (u.email.includes("@internal.invalid") ? u.id.slice(0, 8) + "…" : u.email);
  const slotHost = (s: ScheduleSlot) => s.streamer_display_name?.trim() || s.streamer_email;
  const statusBadge = (status: ScheduleSlot["status"]) =>
    status === "approved"
      ? "badge badge-morning"
      : status === "pending"
        ? "badge badge-evening"
        : "badge";

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const pending = createMut.isPending || patchMut.isPending;
  const mutError = createMut.error ?? patchMut.error;

  return (
    <section className="card">
      <h2>Schedule</h2>
      {/* <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Weekly stream schedule
      </p> */}

      {(isAdmin && users.error) || schedules.error ? (
        <p className="error">{String((users.error ?? schedules.error) as Error)}</p>
      ) : null}

      {isAdmin ? (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${statusFilter === s ? "btn-gold" : "btn-outline"} btn-sm`}
              onClick={() => setStatusFilter(s)}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <button type="button" className="btn btn-outline" onClick={() => setWeekOffset((w) => w - 1)}>
          ◀ Prev
        </button>
        <span style={{ flex: 1, textAlign: "center", fontSize: "0.75rem", color: "var(--text-dim)" }}>
          {weekLabel}
        </span>
        <button type="button" className="btn btn-outline" onClick={() => setWeekOffset((w) => w + 1)}>
          Next ▶
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "0.6rem"
        }}
      >
        {weekDates.map((date, i) => {
          const key = localYmd(date);
          const slots = byDate.get(key) ?? [];
          const isToday = key === todayY;
          return (
            <div
              key={key}
              style={{
                background: "var(--charcoal)",
                border: `1px solid ${isToday ? "var(--gold)" : "var(--border)"}`,
                borderRadius: 3,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  background: "var(--slate)",
                  padding: "0.5rem 0.7rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  borderBottom: "1px solid var(--border)"
                }}
              >
                <span style={{ fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--muted)" }}>
                  {DAY_LABELS[i]}
                </span>
                <span
                  style={{
                    fontFamily: '"Playfair Display", serif',
                    fontSize: "1rem",
                    color: isToday ? "var(--gold)" : "var(--gold-light)"
                  }}
                >
                  {date.getDate()}
                </span>
              </div>
              <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {slots.length === 0 ? (
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "var(--muted)",
                      padding: "0.45rem 0.35rem",
                      border: "1px dashed var(--border)",
                      borderRadius: 2
                    }}
                  >
                    Nothing scheduled
                  </div>
                ) : (
                  slots.map((s) => {
                    const labor = s.entry_type === "labor";
                    return (
                    <div
                      key={s.id}
                      style={{
                        background: "rgba(139,105,20,0.07)",
                        border: "1px solid var(--gold-dark)",
                        borderRadius: 2,
                        padding: "0.45rem"
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.52rem",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--muted)",
                          marginBottom: "0.3rem"
                        }}
                      >
                        {labor ? "Labor" : "Stream"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gold-light)", marginBottom: "0.2rem" }}>
                        {labor && s.hours_worked != null
                          ? `${Number(s.hours_worked).toFixed(2)} hr`
                          : s.start_time}
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>Host: {slotHost(s)}</div>
                      <div style={{ marginTop: "0.25rem" }}>
                        <span className={statusBadge(s.status)}>{s.status}</span>
                      </div>
                      {s.status === "pending" && s.pending_submitted_at ? (
                        <div style={{ fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                          Submitted: {new Date(s.pending_submitted_at).toLocaleString()}
                        </div>
                      ) : null}
                      {s.status === "rejected" && s.review_note ? (
                        <div style={{ fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                          Note: {s.review_note}
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
                        {(isAdmin || s.status === "pending") ? (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>
                            Edit
                          </button>
                        ) : null}
                        {(isAdmin || s.status === "pending") ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (confirm("Delete this entry?")) deleteMut.mutate(s.id);
                            }}
                          >
                            ✕
                          </button>
                        ) : null}
                        {isAdmin && s.status === "pending" && !labor ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-gold btn-sm"
                              onClick={() => reviewMut.mutate({ id: s.id, action: "approve" })}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => reviewMut.mutate({ id: s.id, action: "reject" })}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                  })
                )}
                <button type="button" className="btn btn-outline btn-sm" style={{ width: "100%" }} onClick={() => openAdd(key)}>
                  {isAdmin ? "+ Add" : "+ Request stream"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`modal-overlay${modalOpen ? " open" : ""}`}
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && closeModal()}
      >
        <div className="modal">
          <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">
            ✕
          </button>
          <div className="modal-title">
            {editingId
              ? modalLaborMode
                ? "Edit labor entry"
                : "Edit scheduled stream"
              : isAdmin
                ? modalLaborMode
                  ? "Add labor hours"
                  : "Add scheduled stream"
                : "Request scheduled stream"}
          </div>
          <form onSubmit={onSubmit}>
            {isAdmin ? (
              <div className="form-group">
                <label className="form-label" htmlFor="sc-streamer">
                  User
                </label>
                <select
                  id="sc-streamer"
                  className="form-input"
                  value={formStreamer}
                  onChange={(e) => setFormStreamer(e.target.value)}
                >
                  {scheduleAssignees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="form-group">
              <label className="form-label" htmlFor="sc-date">
                Date
              </label>
              <input
                id="sc-date"
                className="form-input"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            {modalLaborMode ? (
              <div className="form-group">
                <label className="form-label" htmlFor="sc-hours">
                  Hours worked
                </label>
                <input
                  id="sc-hours"
                  className="form-input"
                  type="number"
                  min={0.01}
                  step={0.25}
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label" htmlFor="sc-time">
                  Start time
                </label>
                <input
                  id="sc-time"
                  className="form-input"
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                />
              </div>
            )}
            {mutError ? <p className="error">{(mutError as Error).message}</p> : null}
            {reviewMut.error ? <p className="error">{(reviewMut.error as Error).message}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold" disabled={pending}>
                {isAdmin ? "Save" : "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
