import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { TROY_OUNCES_TO_GRAMS } from "../lib/metal";
import { api } from "../lib/api";
import { EmptyState, InlineAlert, PageHeader, StatusBadge } from "../components/ui";

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

type DailyProfitLoss = {
  date: string;
  revenue: number;
  cogs: number;
  streamExpenses: number;
  expenses: number;
  net: number;
};

type AdminDashboardSummary = {
  profitMetrics: {
    totalSpotValue: number;
    totalCogs: number;
    totalExpenses: number;
    totalStreamExpenses: number;
    grossProfit: number;
    netProfit: number;
    lineItemCount: number;
  };
  inventory: {
    batchCount: number;
    totalGrams: number;
    remainingGrams: number;
    remainingPercent: number;
    totalCost: number;
  };
  bags: { total: number; sold: number };
  dailyProfitLoss: DailyProfitLoss[];
  recentStreams: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    completedEarnings: number | null;
    host: string;
  }>;
};

type HomeResponse = {
  streamsToday: number;
  lastStream: HomeLastStream | null;
  nextSchedule: HomeNextSchedule | null;
  admin?: AdminDashboardSummary;
};

type SpotSnapshot = {
  id: string;
  metal: "gold" | "silver";
  price: number;
  sourceState: string;
  createdAt: string;
};

type SpotLatestResponse = {
  gold: SpotSnapshot | null;
  silver: SpotSnapshot | null;
  available: boolean;
  partial: boolean;
  updatedAt: string;
};

function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  });
}

function parseTs(ts: string): Date {
  return new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
}

function formatUpcomingSchedule(s: HomeNextSchedule): string {
  const t = s.startTime.includes(":") && s.startTime.split(":").length === 2 ? `${s.startTime}:00` : s.startTime;
  const d = new Date(`${s.date}T${t}`);
  if (Number.isNaN(d.getTime())) return `${s.date} · ${s.startTime}`;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function statusClass(state: string): string {
  const s = state.toLowerCase();
  if (s === "primary" || s === "kitco") return "metric-status live";
  if (s === "fallback") return "metric-status warn";
  return "metric-status muted";
}

function MetricCard({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value${tone ? ` ${tone}` : ""}`}>{value}</div>
      {detail ? <div className="metric-detail">{detail}</div> : null}
    </div>
  );
}

function SpotCard({ label, spot }: { label: string; spot: SpotSnapshot | null }) {
  if (!spot) {
    return (
      <div className="metric-card spot-metric">
        <div className="metric-label">{label}</div>
        <div className="metric-value muted">No data</div>
        <div className="metric-detail">Spot ingest has not produced a valid row yet.</div>
      </div>
    );
  }
  const perGram = spot.price / TROY_OUNCES_TO_GRAMS;
  return (
    <div className="metric-card spot-metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{money(spot.price)}<span>/oz</span></div>
      <div className="spot-subline">
        <strong>{money(perGram)}/g</strong>
        <span className={statusClass(spot.sourceState)}>{spot.sourceState}</span>
      </div>
      <div className="metric-detail">Updated {parseTs(spot.createdAt).toLocaleTimeString()}</div>
    </div>
  );
}

function ProfitLossChart({ rows }: { rows: DailyProfitLoss[] }) {
  const maxAbs = useMemo(() => {
    const max = Math.max(...rows.map((r) => Math.abs(r.net)), 1);
    return max;
  }, [rows]);

  return (
    <div className="pl-chart" aria-label="Daily profit loss chart">
      {rows.map((row) => {
        const height = Math.max(6, (Math.abs(row.net) / maxAbs) * 96);
        const isLoss = row.net < 0;
        const d = new Date(`${row.date}T12:00:00`);
        return (
          <div className="pl-day" key={row.date}>
            <div className="pl-bar-track" title={`${row.date}: ${money(row.net)}`}>
              <div
                className={`pl-bar ${isLoss ? "loss" : "profit"}`}
                style={{ height: `${height}px` }}
              />
            </div>
            <div className="pl-label">
              {Number.isNaN(d.getTime()) ? row.date.slice(5) : d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}
            </div>
            <div className={`pl-value ${isLoss ? "loss" : "profit"}`}>{compactMoney(row.net)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TodayAction({
  title,
  detail,
  to,
  action,
  tone = "neutral"
}: {
  title: string;
  detail: string;
  to: string;
  action: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <Link className={`today-action today-action-${tone}`} to={to}>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <b>{action}</b>
    </Link>
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

  const admin = home.data?.admin;
  const last = home.data?.lastStream ?? null;
  const next = home.data?.nextSchedule ?? null;
  const openRecentStreams = admin?.recentStreams.filter((s) => !s.endedAt).length ?? 0;
  const unsoldStickerCount = admin ? Math.max(0, admin.bags.total - admin.bags.sold) : 0;
  const newestSpotMs = Math.max(
    spot.data?.gold?.createdAt ? parseTs(spot.data.gold.createdAt).getTime() : 0,
    spot.data?.silver?.createdAt ? parseTs(spot.data.silver.createdAt).getTime() : 0
  );
  const isSpotStale = newestSpotMs > 0 && Date.now() - newestSpotMs > 5 * 60 * 1000;

  return (
    <section className="dashboard-page">
      <PageHeader
        title="Today"
        description="The next work to do, live metals, and current operating performance."
        action={
          <Link className="btn btn-gold" to="/streams">
            Start stream
          </Link>
        }
      />

      {(home.error || spot.error) ? (
        <p className="error">{((home.error ?? spot.error) as Error).message}</p>
      ) : null}

      {spot.data?.partial ? <InlineAlert tone="warning">Spot feed is partial. One metal is missing a valid snapshot.</InlineAlert> : null}
      {isSpotStale ? <InlineAlert tone="warning">Spot feed looks stale. Check the spot price updater.</InlineAlert> : null}

      <div className="dashboard-section today-workspace">
        <div className="section-title-row">
          <div>
            <h2>Today Workspace</h2>
            <p className="section-description">Quick links for the work most likely to happen during a shift.</p>
          </div>
          <StatusBadge tone={next ? "success" : "neutral"}>
            {next ? "Scheduled" : "No approved stream"}
          </StatusBadge>
        </div>
        <div className="today-grid">
          <TodayAction
            title={next ? "Next stream" : "No stream scheduled"}
            detail={next ? formatUpcomingSchedule(next) : "Go to Schedule to request or add one."}
            to={next ? "/streams" : "/schedule"}
            action={next ? "Open stream" : "Open schedule"}
            tone={next ? "success" : "neutral"}
          />
          {admin ? (
            <>
              <TodayAction
                title="Create stickers"
                detail={`${unsoldStickerCount} unsold stickers available`}
                to="/admin/operations/inventory#create-stickers"
                action="Create"
              />
              <TodayAction
                title="Add metal"
                detail={`${admin.inventory.remainingGrams.toFixed(2)}g currently on hand`}
                to="/admin/operations/inventory#add-metal"
                action="Add"
              />
              <TodayAction
                title="Review past streams"
                detail={openRecentStreams > 0 ? `${openRecentStreams} stream still open` : "Check earnings, expenses, and results."}
                to="/admin/stream-log"
                action="Review"
                tone={openRecentStreams > 0 ? "warning" : "neutral"}
              />
            </>
          ) : (
            <>
              <TodayAction
                title="Start stream"
                detail="Open live stream controls when sales begin."
                to="/streams"
                action="Open"
              />
              <TodayAction
                title="My schedule"
                detail="Request or review upcoming stream slots."
                to="/schedule"
                action="Open"
              />
              <TodayAction
                title={last ? "Last stream" : "First stream"}
                detail={last ? `${last.itemCount} entries logged last time.` : "No streams have been logged yet."}
                to="/streams"
                action={last ? "Review" : "Start"}
              />
            </>
          )}
        </div>
      </div>

      <div className="metric-grid dashboard-prices">
        <SpotCard label="Gold spot" spot={spot.data?.gold ?? null} />
        <SpotCard label="Silver spot" spot={spot.data?.silver ?? null} />
        <MetricCard
          label="Streams today"
          value={home.isLoading ? "—" : (home.data?.streamsToday ?? 0)}
          detail="For your account"
        />
        <MetricCard
          label="Next approved stream"
          value={home.isLoading ? "—" : next ? formatUpcomingSchedule(next) : "None"}
          detail={next ? "Approved schedule" : "No future approved slots"}
        />
      </div>

      {admin ? (
        <>
          <div className="dashboard-section">
            <div className="section-title-row">
              <h2>Profit / Loss</h2>
              <span>Last 14 days</span>
            </div>
            <ProfitLossChart rows={admin.dailyProfitLoss} />
          </div>

          <div className="metric-grid">
            <MetricCard
              label="Net profit"
              value={money(admin.profitMetrics.netProfit)}
              tone={admin.profitMetrics.netProfit < 0 ? "bad" : "good"}
              detail="Gross minus supplies and stream expenses"
            />
            <MetricCard
              label="Gross profit"
              value={money(admin.profitMetrics.grossProfit)}
              tone={admin.profitMetrics.grossProfit < 0 ? "bad" : "good"}
              detail={`${admin.profitMetrics.lineItemCount} stream line items`}
            />
            <MetricCard label="COGS" value={money(admin.profitMetrics.totalCogs)} detail="Inventory cost of goods" />
            <MetricCard
              label="Expenses"
              value={money(admin.profitMetrics.totalExpenses + admin.profitMetrics.totalStreamExpenses)}
              detail={`${money(admin.profitMetrics.totalExpenses)} supplies · ${money(admin.profitMetrics.totalStreamExpenses)} stream`}
            />
            <MetricCard
              label="Inventory remaining"
              value={`${admin.inventory.remainingPercent.toFixed(1)}%`}
              detail={`${admin.inventory.remainingGrams.toFixed(2)}g of ${admin.inventory.totalGrams.toFixed(2)}g`}
            />
            <MetricCard
              label="Sticker bags"
              value={`${admin.bags.sold}/${admin.bags.total}`}
              detail="Sold / total bags"
            />
          </div>
        </>
      ) : null}

      <div className="dashboard-two-col">
        <div className="dashboard-section">
          <div className="section-title-row">
            <h2>Last Stream</h2>
          </div>
          {last ? (
            <div className="stream-summary">
              <div>
                <span>Started</span>
                <strong>{parseTs(last.startedAt).toLocaleString()}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{last.endedAt ? `Ended ${parseTs(last.endedAt).toLocaleTimeString()}` : "Live"}</strong>
              </div>
              <div>
                <span>Items</span>
                <strong>{last.itemCount}</strong>
              </div>
              <div>
                <span>Spot value</span>
                <strong>{money(last.totalSpotValue)}</strong>
              </div>
              <div>
                <span>Estimated profit</span>
                <strong className={last.estimatedProfit < 0 ? "bad" : "good"}>{money(last.estimatedProfit)}</strong>
              </div>
              <div>
                <span>Duration</span>
                <strong>{last.durationMinutes.toFixed(1)} min</strong>
              </div>
            </div>
          ) : (
            <EmptyState title="No streams yet" description="Start a stream when sales begin." />
          )}
        </div>

        {admin ? (
          <div className="dashboard-section">
            <div className="section-title-row">
              <h2>Recent Streams</h2>
            </div>
            <div className="compact-list">
              {admin.recentStreams.map((s) => (
                <div className="compact-row" key={s.id}>
                  <div>
                    <strong>{s.host}</strong>
                    <span>{parseTs(s.startedAt).toLocaleString()}</span>
                  </div>
                  <b>{s.completedEarnings == null ? "Open" : money(s.completedEarnings)}</b>
                </div>
              ))}
              {!admin.recentStreams.length ? <EmptyState title="No past streams yet" description="Completed streams will appear here." /> : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
