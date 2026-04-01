import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type StreamItem = {
  sale_type: string;
  name: string;
  metal: string;
  weight_grams: number;
  spot_value: number;
  spot_price: number;
  sticker_code: string | null;
  batch_id: string | null;
};

type StreamLogStream = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  gold_batch_id: string | null;
  silver_batch_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
  gold_batch_name: string;
  silver_batch_name: string;
  items: StreamItem[];
};

type StreamLogResponse = { streams: StreamLogStream[] };

function hostLabel(s: StreamLogStream) {
  return s.user_display_name?.trim() || s.user_email || "—";
}

function summarizeStream(st: StreamLogStream) {
  const its = st.items ?? [];
  const itemsTotal = its.reduce((sum, i) => sum + Number(i.spot_value), 0);
  const metals = [...new Set(its.map((i) => i.metal || "gold"))];
  const metal = metals.length > 1 ? "mixed" : metals[0] || "gold";
  const avgSpot = its.length ? its.reduce((sum, i) => sum + Number(i.spot_price), 0) / its.length : 0;
  const stN = its.filter((i) => i.sale_type === "sticker").length;
  const rw = its.filter((i) => i.sale_type === "raw").length;
  const leg = its.length - stN - rw;
  const mix =
    leg > 0 ? `${stN} sticker · ${rw} raw · ${leg} other` : `${stN} sticker · ${rw} raw`;
  const rawB = `G: ${st.gold_batch_name} · S: ${st.silver_batch_name}`;
  return { itemsTotal, metal, avgSpot, mix, rawB, count: its.length };
}

export function StreamLogPage() {
  const q = useQuery({
    queryKey: ["admin-stream-log"],
    queryFn: () => api<StreamLogResponse>("/v1/admin/stream-log")
  });

  const streams = q.data?.streams ?? [];
  const totalItems = streams.reduce((s, st) => s + (st.items?.length ?? 0), 0);
  const totalVal = streams.reduce(
    (s, st) => s + (st.items ?? []).reduce((ss, it) => ss + Number(it.spot_value), 0),
    0
  );

  return (
    <section className="card">
      <h2>Stream Log</h2>
      <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        All streaming sessions
      </p>

      {q.error ? <p className="error">{(q.error as Error).message}</p> : null}

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.5rem" }}>
        <div className="stat-box">
          <div className="stat-lbl">Total streams</div>
          <div className="stat-val">{streams.length}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Total items sold</div>
          <div className="stat-val">{totalItems}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Total spot value</div>
          <div className="stat-val">${totalVal.toFixed(0)}</div>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Host</th>
              <th>Metal</th>
              <th>Sales mix</th>
              <th>Raw batches</th>
              <th>Items</th>
              <th>Spot value total</th>
              <th>Avg spot</th>
            </tr>
          </thead>
          <tbody>
            {streams.length === 0 ? (
              <tr>
                <td colSpan={8} className="tbl-empty">
                  No streams logged yet
                </td>
              </tr>
            ) : (
              streams.map((st) => {
                const { itemsTotal, metal, avgSpot, mix, rawB, count } = summarizeStream(st);
                return (
                  <tr key={st.id}>
                    <td>
                      {new Date(st.started_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                      })}
                    </td>
                    <td className="tbl-gold">{hostLabel(st)}</td>
                    <td>
                      <span className="badge badge-morning">{metal}</span>
                    </td>
                    <td style={{ fontSize: "0.62rem" }}>{mix}</td>
                    <td style={{ fontSize: "0.58rem", color: "var(--muted)" }}>{rawB}</td>
                    <td>{count}</td>
                    <td className="tbl-green">${itemsTotal.toFixed(2)}</td>
                    <td>${Number(avgSpot || 0).toFixed(2)}/oz</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
