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

function Shell() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>Gold Platform</strong>
        <nav>
          <NavLink to="/">Home</NavLink>
          <NavLink to="/streams">Streams</NavLink>
          {isAdmin && <NavLink to="/admin/orders">Orders</NavLink>}
          {isAdmin && <NavLink to="/admin/inventory-management">Inventory Management</NavLink>}
          {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
          {isAdmin && <NavLink to="/admin/expenses">Expenses</NavLink>}
          {isAdmin && <NavLink to="/admin/payroll">Payroll</NavLink>}
          {isAdmin && <NavLink to="/admin/schedule">Schedule</NavLink>}
          {isAdmin && <NavLink to="/admin/stream-log">Stream Log</NavLink>}
        </nav>
        <button onClick={() => void signOut()}>Sign out</button>
      </header>
      <main className="content">
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
  );
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <LoginPage />;
  return <Shell />;
}
