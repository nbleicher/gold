import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
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

const ADMIN_SECTION_PATHS = [
  "/admin/expenses",
  "/admin/inventory-management",
  "/admin/orders",
  "/admin/payroll"
] as const;

const STREAMS_LOG_PATH = "/streams/log";

const navTabClass = ({ isActive }: { isActive: boolean }) => `nav-tab${isActive ? " active" : ""}`;

const navSubTabClass = ({ isActive }: { isActive: boolean }) => `nav-tab nav-tab-sub${isActive ? " active" : ""}`;

function Shell() {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";
  const userLabel = profile?.displayName?.trim() || profile?.email || "—";
  const adminSectionActive = ADMIN_SECTION_PATHS.includes(
    location.pathname as (typeof ADMIN_SECTION_PATHS)[number]
  );
  const showAdminSubnav = isAdmin && adminSectionActive;
  const streamsSectionActive = isAdmin
    ? location.pathname === "/streams" || location.pathname === STREAMS_LOG_PATH
    : location.pathname === "/streams";
  const showStreamsSubnav = isAdmin && (location.pathname === "/streams" || location.pathname === STREAMS_LOG_PATH);

  return (
    <div className="app-shell">
      <div className="shimmer-bar" aria-hidden />
      <header className="app-header">
        <div className="app-logo">⬡ GoldStream Live</div>
        <nav className="header-center">
          {isAdmin ? (
            <NavLink
              to="/admin/expenses"
              className={() => `nav-tab${adminSectionActive ? " active" : ""}`}
            >
              Admin
            </NavLink>
          ) : null}
          <NavLink to="/" end className={navTabClass}>
            Home
          </NavLink>
          <NavLink to="/streams" className={() => `nav-tab${streamsSectionActive ? " active" : ""}`}>
            Streams
          </NavLink>
          {isAdmin ? (
            <NavLink to="/admin/schedule" className={navTabClass}>
              Schedule
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
      {showStreamsSubnav ? (
        <div className="admin-subnav">
          <nav className="admin-subnav-inner" aria-label="Streams sections">
            <NavLink to="/streams" end className={navSubTabClass}>
              Live
            </NavLink>
            <NavLink to={STREAMS_LOG_PATH} className={navSubTabClass}>
              Stream Log
            </NavLink>
          </nav>
        </div>
      ) : null}
      {showAdminSubnav ? (
        <div className="admin-subnav">
          <nav className="admin-subnav-inner" aria-label="Admin sections">
            <NavLink to="/admin/expenses" className={navSubTabClass}>
              Supplies
            </NavLink>
            <NavLink to="/admin/inventory-management" className={navSubTabClass}>
              Orders
            </NavLink>
            <NavLink to="/admin/orders" className={navSubTabClass}>
              Inventory Management
            </NavLink>
            <NavLink to="/admin/payroll" className={navSubTabClass}>
              Payroll
            </NavLink>
          </nav>
        </div>
      ) : null}
      <div className="app-body">
        <main className="main-panel">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/streams" element={<StreamsPage />} />
            <Route
              path={STREAMS_LOG_PATH}
              element={isAdmin ? <StreamLogPage /> : <Navigate to="/streams" replace />}
            />
            <Route
              path="/admin/stream-log"
              element={isAdmin ? <Navigate to={STREAMS_LOG_PATH} replace /> : <Navigate to="/" replace />}
            />
            <Route
              path="/admin"
              element={isAdmin ? <Navigate to="/admin/expenses" replace /> : <Navigate to="/" replace />}
            />
            <Route path="/admin/orders" element={isAdmin ? <OrdersPage /> : <Navigate to="/" replace />} />
            <Route
              path="/admin/inventory-management"
              element={isAdmin ? <InventoryMgmtPage /> : <Navigate to="/" replace />}
            />
            <Route path="/admin/users" element={isAdmin ? <AdminUsersPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/expenses" element={isAdmin ? <ExpensesPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/payroll" element={isAdmin ? <PayrollPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/schedule" element={isAdmin ? <SchedulePage /> : <Navigate to="/" replace />} />
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
