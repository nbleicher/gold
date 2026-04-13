import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Expense = { id: string; cost: number };
type Batch = { id: string; grams: number; remaining_grams: number; total_cost: number };
type BagOrder = { id: string };
type ProfitMetrics = {
  totalSpotValue: number;
  totalCogs: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  lineItemCount: number;
};

function money(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AdminDashboardPage() {
  const expenses = useQuery({
    queryKey: ["admin-expenses"],
    queryFn: () => api<Expense[]>("/v1/admin/expenses")
  });
  const batches = useQuery({
    queryKey: ["batches"],
    queryFn: () => api<Batch[]>("/v1/inventory/batches")
  });
  const bagOrders = useQuery({
    queryKey: ["bag-orders"],
    queryFn: () => api<BagOrder[]>("/v1/bag-orders")
  });
  const profitMetrics = useQuery({
    queryKey: ["admin-profit-metrics"],
    queryFn: () => api<ProfitMetrics>("/v1/admin/profit-metrics")
  });

  const metrics = useMemo(() => {
    const supplyTotalCost = (expenses.data ?? []).reduce((sum, item) => sum + Number(item.cost), 0);
    const batchTotalCost = (batches.data ?? []).reduce((sum, item) => sum + Number(item.total_cost), 0);
    const totalBatchGrams = (batches.data ?? []).reduce((sum, item) => sum + Number(item.grams), 0);
    const totalBatchRemaining = (batches.data ?? []).reduce((sum, item) => sum + Number(item.remaining_grams), 0);
    const batchRemainingPct = totalBatchGrams > 0 ? (totalBatchRemaining / totalBatchGrams) * 100 : 0;
    const totalBags = (bagOrders.data ?? []).length;
    const totalCost = supplyTotalCost + batchTotalCost;
    return {
      supplyTotalCost,
      batchTotalCost,
      batchRemainingPct,
      totalBags,
      totalCost
    };
  }, [expenses.data, batches.data, bagOrders.data]);

  const error = expenses.error ?? batches.error ?? bagOrders.error ?? profitMetrics.error;

  return (
    <section className="card">
      <h2>Admin Dashboard</h2>
      {/* <p className="pg-sub" style={{ marginBottom: "1rem", fontSize: "0.65rem", color: "var(--text-dim)" }}>
        Quick all-time snapshot for supplies, batches, and bag inventory
      </p> */}

      {error ? <p className="error">{String(error as Error)}</p> : null}

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "0.75rem" }}>
        <div className="stat-box">
          <div className="stat-lbl">Supplies total cost</div>
          <div className="stat-val">{money(metrics.supplyTotalCost)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Batch Management</div>
          <div className="stat-val">{metrics.batchRemainingPct.toFixed(2)}%</div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            {money(metrics.batchTotalCost)} total cost
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Inventory Management</div>
          <div className="stat-val">{metrics.totalBags}</div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>Total bags</div>
        </div>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-box">
          <div className="stat-lbl">Total cost</div>
          <div className="stat-val">{money(metrics.totalCost)}</div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Supplies + Batch Management
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Gross profit</div>
          <div className="stat-val">{money(profitMetrics.data?.grossProfit ?? 0)}</div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Spot value − COGS ({profitMetrics.data?.lineItemCount ?? 0} line items)
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-lbl">Net profit</div>
          <div className="stat-val">{money(profitMetrics.data?.netProfit ?? 0)}</div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Gross − supplies ({money(profitMetrics.data?.totalExpenses ?? 0)})
          </div>
        </div>
      </div>
    </section>
  );
}
