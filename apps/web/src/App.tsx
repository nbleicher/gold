import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./state/auth";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { StreamsPage } from "./pages/StreamsPage";
import { InventoryMgmtPage } from "./pages/InventoryMgmtPage";
import { OrdersPage } from "./pages/OrdersPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { SchedulePage } from "./pages/SchedulePage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { PayrollPage } from "./pages/PayrollPage";
import { StreamLogPage } from "./pages/StreamLogPage";

const navTabClass = ({ isActive }: { isActive: boolean }) => `nav-tab${isActive ? " active" : ""}`;

function Shell() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";
  const userLabel = profile?.displayName?.trim() || profile?.email || "—";

  return (
    <div className="app-shell">
      <div className="shimmer-bar" aria-hidden />
      <header className="app-header">
        <div className="app-logo">⬡ GoldStream Live</div>
        <nav className="header-center">
          <NavLink to="/" end className={navTabClass}>
            Home
          </NavLink>
          <NavLink to="/streams" className={navTabClass}>
            Streams
          </NavLink>
          {isAdmin ? (
            <NavLink to="/admin/stream-log" className={navTabClass}>
              Stream Log
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink to="/admin/orders" className={navTabClass}>
              Orders
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink to="/admin/expenses" className={navTabClass}>
              Expenses
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink to="/admin/inventory-management" className={navTabClass}>
              Inventory
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink to="/admin/schedule" className={navTabClass}>
              Schedule
            </NavLink>
          ) : null}
          {isAdmin ? (
            <NavLink to="/admin/payroll" className={navTabClass}>
              Payroll
            </NavLink>
          ) : null}
        </nav>
        <div className="header-right">
          {isAdmin ? <span className="admin-badge">Admin</span> : null}
          <span className="user-pill" title={profile?.email ?? ""}>
            {userLabel}
          </span>
          <button type="button" className="logout-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="app-body">
        <main className="main-panel">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/streams" element={<StreamsPage />} />
            <Route path="/admin/orders" element={isAdmin ? <OrdersPage /> : <Navigate to="/" replace />} />
            <Route
              path="/admin/inventory-management"
              element={isAdmin ? <InventoryMgmtPage /> : <Navigate to="/" replace />}
            />
            <Route path="/admin/users" element={isAdmin ? <AdminUsersPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/expenses" element={isAdmin ? <ExpensesPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/payroll" element={isAdmin ? <PayrollPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/schedule" element={isAdmin ? <SchedulePage /> : <Navigate to="/" replace />} />
            <Route path="/admin/stream-log" element={isAdmin ? <StreamLogPage /> : <Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginPage />;
  return <Shell />;
}
