import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type AdminUser = { id: string; email: string; display_name: string | null; role: string };
type ScheduleSlot = {
  id: string;
  date: string;
  start_time: string;
  streamer_id: string;
  created_at: string;
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
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");
  const [formStreamer, setFormStreamer] = useState("");

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from = localYmd(weekDates[0]);
  const to = localYmd(weekDates[6]);
  const todayY = localYmd(new Date());

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<AdminUser[]>("/v1/admin/users")
  });

  const schedules = useQuery({
    queryKey: ["admin-schedules", from, to],
    queryFn: () =>
      api<ScheduleSlot[]>(`/v1/admin/schedules?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  });

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleSlot[]>();
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
    mutationFn: () =>
      api<ScheduleSlot>("/v1/admin/schedules", {
        method: "POST",
        body: JSON.stringify({ date: formDate, startTime: formTime, streamerId: formStreamer })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedules"] });
      closeModal();
    }
  });

  const patchMut = useMutation({
    mutationFn: () =>
      api<ScheduleSlot>(`/v1/admin/schedules/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ date: formDate, startTime: formTime, streamerId: formStreamer })
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedules"] });
      closeModal();
    }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/v1/admin/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-schedules"] })
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const openAdd = (dateKey: string) => {
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

  const openEdit = (slot: ScheduleSlot) => {
    setEditingId(slot.id);
    setFormDate(slot.date);
    setFormTime(slot.start_time.length >= 5 ? slot.start_time.slice(0, 5) : slot.start_time);
    setFormStreamer(slot.streamer_id);
    setModalOpen(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formDate || !formTime || !formStreamer) return;
    if (editingId) patchMut.mutate();
    else createMut.mutate();
  };

  const userLabel = (u: AdminUser) => u.display_name?.trim() || u.email;
  const slotHost = (s: ScheduleSlot) => s.streamer_display_name?.trim() || s.streamer_email;

  const weekLabel = `${weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const pending = createMut.isPending || patchMut.isPending;
  const mutError = createMut.error ?? patchMut.error;

  return (
    <section className="card">
      <h2>Schedule</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Weekly stream schedule
      </p>

      {users.error || schedules.error ? (
        <p className="error">{String((users.error ?? schedules.error) as Error)}</p>
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
                    No streams
                  </div>
                ) : (
                  slots.map((s) => (
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
                        Stream
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--gold-light)", marginBottom: "0.2rem" }}>
                        {s.start_time}
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>Host: {slotHost(s)}</div>
                      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem" }}>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            if (confirm("Delete this stream card?")) deleteMut.mutate(s.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <button type="button" className="btn btn-outline btn-sm" style={{ width: "100%" }} onClick={() => openAdd(key)}>
                  + Add stream
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
          <div className="modal-title">{editingId ? "Edit scheduled stream" : "Add scheduled stream"}</div>
          <form onSubmit={onSubmit}>
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
            <div className="form-group">
              <label className="form-label" htmlFor="sc-streamer">
                Streamer
              </label>
              <select
                id="sc-streamer"
                className="form-input"
                value={formStreamer}
                onChange={(e) => setFormStreamer(e.target.value)}
              >
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </div>
            {mutError ? <p className="error">{(mutError as Error).message}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gold" disabled={pending}>
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
