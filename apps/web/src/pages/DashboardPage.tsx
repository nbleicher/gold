import { useQuery } from "@tanstack/react-query";
import { TROY_OUNCES_TO_GRAMS } from "@gold/shared";
import { api } from "../lib/api";

type HomeLastStream = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  itemCount: number;
  totalSpotValue: number;
  estimatedProfit: number;
  durationMinutes: number;
  profitPerMinute: number;
};

type HomeNextSchedule = {
  id: string;
  date: string;
  startTime: string;
  status: string;
};

type HomeResponse = {
  streamsToday: number;
  lastStream: HomeLastStream | null;
  nextSchedule: HomeNextSchedule | null;
};

type SpotSnapshot = {
  id: string;
  metal: string;
  price: number;
  source_state: string;
  created_at: string;
};

type SpotLatestResponse = {
  gold: SpotSnapshot | null;
  silver: SpotSnapshot | null;
  available: boolean;
  partial: boolean;
  updatedAt: string;
};

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function spotStatusClass(state: string) {
  if (state === "primary" || state === "kitco") return "spot-status primary";
  if (state === "fallback") return "spot-status fallback";
  return "spot-status offline";
}

function parseSqlUtc(ts: string): Date {
  return new Date(ts.replace(" ", "T") + "Z");
}

function formatUpcomingSchedule(s: HomeNextSchedule): string {
  const t = s.startTime.includes(":") && s.startTime.split(":").length === 2 ? `${s.startTime}:00` : s.startTime;
  const d = new Date(`${s.date}T${t}`);
  if (Number.isNaN(d.getTime())) return `${s.date} · ${s.startTime}`;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function SpotMetalCard({
  label,
  row,
  emphasize
}: {
  label: string;
  row: SpotSnapshot | null;
  emphasize?: boolean;
}) {
  if (!row) {
    return (
      <div className={`spot-card${emphasize ? " active" : ""}`}>
        <div className="spot-label">{label}</div>
        <div className="spot-price" style={{ fontSize: "1.1rem", color: "var(--muted)" }}>
          No data yet
        </div>
        <p style={{ fontSize: "0.55rem", color: "var(--muted)", marginTop: "0.5rem", lineHeight: 1.4 }}>
          Run the spot ingest job (see README) or wait for the next scheduled run.
        </p>
      </div>
    );
  }

  const spotOz = Number(row.price);
  const spotGram = spotOz / TROY_OUNCES_TO_GRAMS;

  return (
    <div className={`spot-card${emphasize ? " active" : ""}`}>
      <div className="spot-label">{label}</div>
      <div className="spot-price">
        {fmtMoney(spotGram)}
        <span className="spot-unit">/g</span>
      </div>
      <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>
        {fmtMoney(spotOz)}
        <span className="spot-unit">/oz</span>
      </div>
      <div className="spot-live-text" style={{ marginTop: "0.35rem" }}>
        <span className={spotStatusClass(row.source_state)}>{row.source_state}</span>
        <span style={{ marginLeft: "0.5rem", color: "var(--muted)" }}>
          {parseSqlUtc(row.created_at).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const home = useQuery({
    queryKey: ["dashboard-home"],
    queryFn: () => api<HomeResponse>("/v1/dashboard/home")
  });

  const spot = useQuery({
    queryKey: ["spot-latest"],
    queryFn: () => api<SpotLatestResponse>("/v1/spot/latest"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  });
  const newestSpotMs = Math.max(
    spot.data?.gold?.created_at ? parseSqlUtc(spot.data.gold.created_at).getTime() : 0,
    spot.data?.silver?.created_at ? parseSqlUtc(spot.data.silver.created_at).getTime() : 0
  );
  const staleMs = newestSpotMs > 0 ? Date.now() - newestSpotMs : 0;
  const isSpotStale = staleMs > 2 * 60 * 1000;

  const last = home.data?.lastStream ?? null;
  const next = home.data?.nextSchedule ?? null;

  return (
    <section className="card">
      <h2 className="pg-title">Home</h2>
      {/* <p className="pg-sub">Streams, last session margin, live spot</p> */}

      {spot.isSuccess ? (
        <>
          {isSpotStale ? (
            <p style={{ fontSize: "0.6rem", color: "var(--gold)", marginBottom: "0.75rem" }}>
              Spot feed appears stale (last update over 2 minutes ago). Check VPS push job and API push secret config.
            </p>
          ) : null}
          {spot.data.partial ? (
            <p style={{ fontSize: "0.6rem", color: "var(--gold)", marginBottom: "0.75rem" }}>
              Spot feed is partial (only one metal has snapshots). Run spot ingest for both metals.
            </p>
          ) : null}
          <div className="spot-ticker">
            <SpotMetalCard label="Gold" row={spot.data.gold} emphasize />
            <SpotMetalCard label="Silver" row={spot.data.silver} />
          </div>
        </>
      ) : spot.isError ? (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {(spot.error as Error).message}
        </p>
      ) : spot.isLoading ? (
        <p style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "1rem" }}>Loading spot…</p>
      ) : null}

      {home.error ? <p className="error">{(home.error as Error).message}</p> : null}

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "0.5rem" }}>
        <div className="stat-box">
          <div className="stat-lbl">Streams today (UTC)</div>
          <div className="stat-val">{home.isLoading ? "—" : (home.data?.streamsToday ?? 0)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Last stream · est. profit</div>
          <div className="stat-val" style={{ fontSize: "1.35rem" }}>
            {home.isLoading ? "—" : last ? fmtMoney(last.estimatedProfit) : "—"}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Upcoming stream</div>
          <div className="stat-val" style={{ fontSize: "1.05rem", lineHeight: 1.25 }}>
            {home.isLoading ? "—" : next ? formatUpcomingSchedule(next) : "—"}
          </div>
          {!home.isLoading && !next ? (
            <div style={{ fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.35rem" }}>
              No approved future slots
            </div>
          ) : null}
        </div>
      </div>

      {last ? (
        <div
          style={{
            fontSize: "0.65rem",
            color: "var(--text-dim)",
            borderTop: "1px solid var(--border)",
            paddingTop: "1rem"
          }}
        >
          <div>
            <strong>Last stream</strong> · {new Date(last.startedAt).toLocaleString()}
            {last.endedAt ? ` → ${new Date(last.endedAt).toLocaleString()}` : " · live"}
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            {last.itemCount} sale{last.itemCount === 1 ? "" : "s"} · spot value {fmtMoney(last.totalSpotValue)}{" "}
            · ~{last.durationMinutes.toFixed(1)} min
          </div>
        </div>
      ) : !home.isLoading && home.data ? (
        <p style={{ fontSize: "0.65rem", color: "var(--muted)" }}>No streams yet for this account.</p>
      ) : null}
    </section>
  );
}
