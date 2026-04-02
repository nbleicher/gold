import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
const ADMIN_SECTION_PATHS = ["/admin/expenses", "/admin/inventory-management", "/admin/orders"];
const navTabClass = ({ isActive }) => `nav-tab${isActive ? " active" : ""}`;
const navSubTabClass = ({ isActive }) => `nav-tab nav-tab-sub${isActive ? " active" : ""}`;
function Shell() {
    const location = useLocation();
    const { profile, signOut } = useAuth();
    const isAdmin = profile?.role === "admin";
    const userLabel = profile?.displayName?.trim() || profile?.email || "—";
    const adminSectionActive = ADMIN_SECTION_PATHS.includes(location.pathname);
    const showAdminSubnav = isAdmin && adminSectionActive;
    return (_jsxs("div", { className: "app-shell", children: [_jsx("div", { className: "shimmer-bar", "aria-hidden": true }), _jsxs("header", { className: "app-header", children: [_jsx("div", { className: "app-logo", children: "\u2B21 GoldStream Live" }), _jsxs("nav", { className: "header-center", children: [_jsx(NavLink, { to: "/", end: true, className: navTabClass, children: "Home" }), _jsx(NavLink, { to: "/streams", className: navTabClass, children: "Streams" }), isAdmin ? (_jsx(NavLink, { to: "/admin/stream-log", className: navTabClass, children: "Stream Log" })) : null, isAdmin ? (_jsx(NavLink, { to: "/admin/expenses", className: () => `nav-tab${adminSectionActive ? " active" : ""}`, children: "Admin" })) : null, isAdmin ? (_jsx(NavLink, { to: "/admin/schedule", className: navTabClass, children: "Schedule" })) : null, isAdmin ? (_jsx(NavLink, { to: "/admin/payroll", className: navTabClass, children: "Payroll" })) : null] }), _jsxs("div", { className: "header-right", children: [isAdmin ? _jsx("span", { className: "admin-badge", children: "Admin" }) : null, _jsx("span", { className: "user-pill", title: profile?.email ?? "", children: userLabel }), _jsx("button", { type: "button", className: "logout-btn", onClick: () => void signOut(), children: "Sign out" })] })] }), showAdminSubnav ? (_jsx("div", { className: "admin-subnav", children: _jsxs("nav", { className: "admin-subnav-inner", "aria-label": "Admin sections", children: [_jsx(NavLink, { to: "/admin/expenses", className: navSubTabClass, children: "Supplies" }), _jsx(NavLink, { to: "/admin/inventory-management", className: navSubTabClass, children: "Orders" }), _jsx(NavLink, { to: "/admin/orders", className: navSubTabClass, children: "Inventory Management" })] }) })) : null, _jsx("div", { className: "app-body", children: _jsx("main", { className: "main-panel", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/streams", element: _jsx(StreamsPage, {}) }), _jsx(Route, { path: "/admin", element: isAdmin ? _jsx(Navigate, { to: "/admin/expenses", replace: true }) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/orders", element: isAdmin ? _jsx(OrdersPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/inventory-management", element: isAdmin ? _jsx(InventoryMgmtPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/users", element: isAdmin ? _jsx(AdminUsersPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/expenses", element: isAdmin ? _jsx(ExpensesPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/payroll", element: isAdmin ? _jsx(PayrollPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/schedule", element: isAdmin ? _jsx(SchedulePage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/stream-log", element: isAdmin ? _jsx(StreamLogPage, {}) : _jsx(Navigate, { to: "/", replace: true }) })] }) }) })] }));
}
export function App() {
    const { user, loading } = useAuth();
    if (loading)
        return _jsx("div", { className: "app-loading", children: "Loading\u2026" });
    if (!user)
        return _jsx(LoginPage, {});
    return _jsx(Shell, {});
}
