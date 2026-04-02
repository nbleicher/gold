import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
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
];
const STREAMS_LOG_PATH = "/streams/log";
const navTabClass = ({ isActive }) => `nav-tab${isActive ? " active" : ""}`;
const navSubTabClass = ({ isActive }) => `nav-tab nav-tab-sub${isActive ? " active" : ""}`;
function Shell() {
    const location = useLocation();
    const { profile, signOut } = useAuth();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const isAdmin = profile?.role === "admin";
    const userLabel = profile?.displayName?.trim() || profile?.email || "—";
    const adminSectionActive = ADMIN_SECTION_PATHS.includes(location.pathname);
    const showAdminSubnav = isAdmin && adminSectionActive;
    const streamsSectionActive = isAdmin
        ? location.pathname === "/streams" || location.pathname === STREAMS_LOG_PATH
        : location.pathname === "/streams";
    const showStreamsSubnav = isAdmin && (location.pathname === "/streams" || location.pathname === STREAMS_LOG_PATH);
    useEffect(() => {
        setMobileNavOpen(false);
    }, [location.pathname]);
    useEffect(() => {
        if (!mobileNavOpen)
            return;
        const onKeyDown = (e) => {
            if (e.key === "Escape")
                setMobileNavOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [mobileNavOpen]);
    useEffect(() => {
        document.body.style.overflow = mobileNavOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileNavOpen]);
    return (_jsxs("div", { className: "app-shell", children: [_jsx("div", { className: "shimmer-bar", "aria-hidden": true }), _jsxs("header", { className: "app-header", children: [_jsx("div", { className: "app-logo", children: "\u2B21 GoldStream Live" }), _jsx("button", { type: "button", className: "hamburger-btn", "aria-label": mobileNavOpen ? "Close menu" : "Open menu", "aria-expanded": mobileNavOpen, "aria-controls": "mobile-nav-panel", onClick: () => setMobileNavOpen((v) => !v), children: "\u2630" }), _jsxs("nav", { className: "header-center", children: [isAdmin ? (_jsx(NavLink, { to: "/admin/expenses", className: () => `nav-tab${adminSectionActive ? " active" : ""}`, children: "Admin" })) : null, _jsx(NavLink, { to: "/", end: true, className: navTabClass, children: "Home" }), _jsx(NavLink, { to: "/streams", className: () => `nav-tab${streamsSectionActive ? " active" : ""}`, children: "Streams" }), isAdmin ? (_jsx(NavLink, { to: "/admin/schedule", className: navTabClass, children: "Schedule" })) : null] }), _jsxs("div", { className: "header-right", children: [isAdmin ? _jsx("span", { className: "admin-badge", children: "Admin" }) : null, _jsx("span", { className: "user-pill", title: profile?.email ?? "", children: userLabel }), _jsx("button", { type: "button", className: "logout-btn", onClick: () => void signOut(), children: "Sign out" })] })] }), mobileNavOpen ? (_jsx("div", { className: "mobile-nav-overlay", onClick: () => setMobileNavOpen(false), children: _jsxs("nav", { id: "mobile-nav-panel", className: "mobile-nav-panel", "aria-label": "Main navigation", onClick: (e) => e.stopPropagation(), children: [isAdmin ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "mobile-nav-section-label", children: "Admin" }), _jsx(NavLink, { to: "/admin/expenses", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Admin Home" }), _jsx(NavLink, { to: "/admin/expenses", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Supplies" }), _jsx(NavLink, { to: "/admin/inventory-management", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Batch Management" }), _jsx(NavLink, { to: "/admin/orders", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Inventory Management" }), _jsx(NavLink, { to: "/admin/payroll", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Payroll" }), _jsx(NavLink, { to: "/admin/schedule", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Schedule" })] })) : null, _jsx("div", { className: "mobile-nav-section-label", children: "Main" }), _jsx(NavLink, { to: "/", end: true, className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Home" }), _jsx(NavLink, { to: "/streams", className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Streams" }), isAdmin ? (_jsx(NavLink, { to: STREAMS_LOG_PATH, className: navTabClass, onClick: () => setMobileNavOpen(false), children: "Stream Log" })) : null, _jsx("button", { type: "button", className: "logout-btn mobile-nav-logout", onClick: () => void signOut(), children: "Sign out" })] }) })) : null, showStreamsSubnav ? (_jsx("div", { className: "admin-subnav", children: _jsxs("nav", { className: "admin-subnav-inner", "aria-label": "Streams sections", children: [_jsx(NavLink, { to: "/streams", end: true, className: navSubTabClass, children: "Live" }), _jsx(NavLink, { to: STREAMS_LOG_PATH, className: navSubTabClass, children: "Stream Log" })] }) })) : null, showAdminSubnav ? (_jsx("div", { className: "admin-subnav", children: _jsxs("nav", { className: "admin-subnav-inner", "aria-label": "Admin sections", children: [_jsx(NavLink, { to: "/admin/expenses", className: navSubTabClass, children: "Supplies" }), _jsx(NavLink, { to: "/admin/inventory-management", className: navSubTabClass, children: "Batch Management" }), _jsx(NavLink, { to: "/admin/orders", className: navSubTabClass, children: "Inventory Management" }), _jsx(NavLink, { to: "/admin/payroll", className: navSubTabClass, children: "Payroll" })] }) })) : null, _jsx("div", { className: "app-body", children: _jsx("main", { className: "main-panel", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/streams", element: _jsx(StreamsPage, {}) }), _jsx(Route, { path: STREAMS_LOG_PATH, element: isAdmin ? _jsx(StreamLogPage, {}) : _jsx(Navigate, { to: "/streams", replace: true }) }), _jsx(Route, { path: "/admin/stream-log", element: isAdmin ? _jsx(Navigate, { to: STREAMS_LOG_PATH, replace: true }) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin", element: isAdmin ? _jsx(Navigate, { to: "/admin/expenses", replace: true }) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/orders", element: isAdmin ? _jsx(OrdersPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/inventory-management", element: isAdmin ? _jsx(InventoryMgmtPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/users", element: isAdmin ? _jsx(AdminUsersPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/expenses", element: isAdmin ? _jsx(ExpensesPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/payroll", element: isAdmin ? _jsx(PayrollPage, {}) : _jsx(Navigate, { to: "/", replace: true }) }), _jsx(Route, { path: "/admin/schedule", element: isAdmin ? _jsx(SchedulePage, {}) : _jsx(Navigate, { to: "/", replace: true }) })] }) }) })] }));
}
export function App() {
    const { user, loading } = useAuth();
    if (loading)
        return _jsx("div", { className: "app-loading", children: "Loading\u2026" });
    if (!user)
        return _jsx(LoginPage, {});
    return _jsx(Shell, {});
}
