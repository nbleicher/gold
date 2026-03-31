import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "topbar", children: [_jsx("strong", { children: "Gold Platform" }), _jsxs("nav", { children: [_jsx(NavLink, { to: "/", children: "Home" }), _jsx(NavLink, { to: "/streams", children: "Streams" }), isAdmin && _jsx(NavLink, { to: "/admin/orders", children: "Orders" }), isAdmin && _jsx(NavLink, { to: "/admin/inventory-management", children: "Inventory Management" }), isAdmin && _jsx(NavLink, { to: "/admin/users", children: "Users" }), isAdmin && _jsx(NavLink, { to: "/admin/expenses", children: "Expenses" }), isAdmin && _jsx(NavLink, { to: "/admin/payroll", children: "Payroll" }), isAdmin && _jsx(NavLink, { to: "/admin/schedule", children: "Schedule" }), isAdmin && _jsx(NavLink, { to: "/admin/stream-log", children: "Stream Log" })] }), _jsx("button", { onClick: () => void signOut(), children: "Sign out" })] }), _jsx("main", { className: "content", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/streams", element: _jsx(StreamsPage, {}) }), _jsx(Route, { path: "/admin/orders", element: isAdmin ? _jsx(OrdersPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/inventory-management", element: isAdmin ? _jsx(InventoryMgmtPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/users", element: isAdmin ? _jsx(AdminUsersPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/expenses", element: isAdmin ? _jsx(ExpensesPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/payroll", element: isAdmin ? _jsx(PayrollPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/schedule", element: isAdmin ? _jsx(SchedulePage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/stream-log", element: isAdmin ? _jsx(StreamLogPage, {}) : _jsx(Navigate, { to: "/", replace: true }) })] }) })] }));
}
export function App() {
    const { user, loading } = useAuth();
    if (loading)
        return _jsx("div", { className: "centered", children: "Loading\u2026" });
    if (!user)
        return _jsx(LoginPage, {});
    return _jsx(Shell, {});
}
