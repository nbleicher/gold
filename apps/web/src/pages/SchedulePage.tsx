import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: number;
};
type ScheduleSlot = {
  id: string;
  date: string;
  start_time: string;
  end_time?: string | null;
  sort_order?: number;
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

function reorderIds(ids: string[], fromIndex: number, toIndex: number): string[] {
  const next = [...ids];
  const [x] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, x);
  return next;
}

function formatScheduleReadonlyDate(ymd: string): string {
  if (!ymd || ymd.length < 10) return ymd;
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

/** Hide clock row when DB uses midnight placeholder with no end time (order-only schedule). */
function streamRowHidesClock(s: ScheduleSlot): boolean {
  const st = (s.start_time ?? "").trim();
  const short = st.length >= 5 ? st.slice(0, 5) : st;
  const et = s.end_time?.trim();
  return short === "00:00" && !et;
}

export function SchedulePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formStreamer, setFormStreamer] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [dragStreamId, setDragStreamId] = useState<string | null>(null);
  const [dragHoverId, setDragHoverId] = useState<string | null>(null);

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
        (u) => Boolean(u.is_active) && (u.role === "admin" || u.role === "streamer")
      ),
    [users.data]
  );

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

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleSlot[]>();
    for (const s of (schedules.data ?? []) as ScheduleSlot[]) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => {
        const ao = Number(a.sort_order ?? 0);
        const bo = Number(b.sort_order ?? 0);
        if (ao !== bo) return ao - bo;
        const byTime = a.start_time.localeCompare(b.start_time);
        if (byTime !== 0) return byTime;
        const at = a.pending_submitted_at ?? a.created_at;
        const bt = b.pending_submitted_at ?? b.created_at;
        return bt.localeCompare(at);
      });
    }
    return m;
  }, [schedules.data]);

  const streamPayload = (): Record<string, unknown> => {
    if (editingId) {
      return isAdmin ? { streamerId: formStreamer } : {};
    }
    return isAdmin ? { date: formDate, streamerId: formStreamer } : { date: formDate };
  };

  const createMut = useMutation({
    mutationFn: () => {
      if (isAdmin) {
        return api<ScheduleSlot>("/v1/admin/schedules", {
          method: "POST",
          body: JSON.stringify(streamPayload())
        });
      }
      return api<ScheduleSlot>("/v1/schedules/mine", {
        method: "POST",
        body: JSON.stringify(streamPayload())
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
        return api<ScheduleSlot>(`/v1/admin/schedules/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(streamPayload())
        });
      }
      return api<ScheduleSlot>(`/v1/schedules/mine/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(streamPayload())
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

  const reorderMut = useMutation({
    mutationFn: (payload: { date: string; orderedIds: string[] }) =>
      api<{ ok: boolean }>("/v1/admin/schedules/reorder", {
        method: "PATCH",
        body: JSON.stringify(payload)
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
    if (isAdmin) {
      const u = scheduleAssignees;
      if (!u.length) {
        alert("Add an admin or streamer user first.");
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
    setFormStreamer(slot.streamer_id);
    setModalOpen(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formDate || (isAdmin && !formStreamer)) return;
    if (editingId) patchMut.mutate();
    else createMut.mutate();
  };

  const userLabel = (u: AdminUser) =>
    u.display_name?.trim() || u.username;
  const slotHost = (s: ScheduleSlot) => s.streamer_display_name?.trim() || s.streamer_email;

  const streamTimeLabel = (s: ScheduleSlot) => {
    const st = s.start_time.length >= 5 ? s.start_time.slice(0, 5) : s.start_time;
    const et = s.end_time?.trim();
    if (et && et.length >= 5) return `${st}–${et.slice(0, 5)}`;
    if (et) return `${st}–${et}`;
    return st;
  };
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

      {(isAdmin && users.error) || schedules.error || reorderMut.error ? (
        <p className="error">
          {String((users.error ?? schedules.error ?? reorderMut.error) as Error)}
        </p>
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

      {isAdmin ? (
        <p style={{ fontSize: "0.62rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          Use the ⋮⋮ handle on each stream card to drag and reorder within that day (saved automatically).
        </p>
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

      <div style={{ display: "flex", justifyContent: "center", width: "100%", overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 9rem))",
            gap: "0.45rem",
            width: "100%",
            maxWidth: "66rem",
            paddingBottom: "0.25rem"
          }}
        >
        {weekDates.map((date, i) => {
          const key = localYmd(date);
          const slots = (byDate.get(key) ?? []).filter((s) => s.entry_type !== "labor");
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
              <div style={{ padding: "0.35rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
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
                    const showClock = !streamRowHidesClock(s);
                    const isDropHighlight =
                      isAdmin && dragStreamId && dragStreamId !== s.id && dragHoverId === s.id;
                    return (
                    <div
                      key={s.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (isAdmin && dragStreamId && dragStreamId !== s.id) {
                          setDragHoverId(s.id);
                        }
                      }}
                      onDragLeave={() => setDragHoverId((hid) => (hid === s.id ? null : hid))}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!isAdmin || !dragStreamId || dragStreamId === s.id) return;
                        const ids = slots.map((x) => x.id);
                        const from = ids.indexOf(dragStreamId);
                        const to = ids.indexOf(s.id);
                        if (from < 0 || to < 0) return;
                        const orderedIds = reorderIds(ids, from, to);
                        reorderMut.mutate({ date: key, orderedIds });
                        setDragStreamId(null);
                        setDragHoverId(null);
                      }}
                      style={{
                        background: "rgba(139,105,20,0.07)",
                        border: isDropHighlight ? "1px dashed var(--gold)" : "1px solid var(--gold-dark)",
                        borderRadius: 2,
                        padding: "0.35rem",
                        opacity: dragStreamId === s.id ? 0.72 : 1
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.3rem", alignItems: "flex-start" }}>
                        {isAdmin ? (
                          <span
                            draggable
                            title="Drag to reorder"
                            aria-label="Drag to reorder"
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDragStreamId(s.id);
                              try {
                                e.dataTransfer.setData("text/plain", s.id);
                                e.dataTransfer.effectAllowed = "move";
                              } catch {
                                /* ignore */
                              }
                            }}
                            onDragEnd={() => {
                              setDragStreamId(null);
                              setDragHoverId(null);
                            }}
                            style={{
                              cursor: "grab",
                              color: "var(--muted)",
                              fontSize: "0.78rem",
                              lineHeight: 1.1,
                              padding: "0.15rem 0 0 0",
                              userSelect: "none",
                              flexShrink: 0
                            }}
                          >
                            ⋮⋮
                          </span>
                        ) : null}
                        <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "0.52rem",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          color: "var(--muted)",
                          marginBottom: "0.25rem"
                        }}
                      >
                        Stream
                      </div>
                      {showClock ? (
                        <div style={{ fontSize: "0.68rem", color: "var(--gold-light)", marginBottom: "0.15rem" }}>
                          {streamTimeLabel(s)}
                        </div>
                      ) : null}
                      <div style={{ fontSize: "0.62rem", color: "var(--text-dim)", fontWeight: 600 }}>
                        {slotHost(s)}
                      </div>
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
                        {isAdmin && s.status === "pending" ? (
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
            {editingId ? "Edit scheduled stream" : isAdmin ? "Add scheduled stream" : "Request scheduled stream"}
          </div>
          <form onSubmit={onSubmit}>
            {isAdmin ? (
              <div className="form-group">
                <label className="form-label" htmlFor="sc-streamer">
                  Host
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
              <span className="form-label">Date</span>
              <div
                className="form-input"
                style={{
                  background: "var(--surface-2, rgba(0,0,0,0.15))",
                  cursor: "default",
                  color: "var(--text-dim)"
                }}
              >
                {formatScheduleReadonlyDate(formDate)}
              </div>
            </div>
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
