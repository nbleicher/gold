import { useEffect, useLayoutEffect, useState } from "react";
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
import { AdminDashboardPage } from "./pages/AdminDashboardPage";

const ADMIN_SECTION_PATHS = [
  "/admin/dashboard",
  "/admin/expenses",
  "/admin/inventory-management",
  "/admin/orders",
  "/admin/payroll",
  "/admin/users"
] as const;

const STREAMS_LOG_PATH = "/streams/log";

const THEME_STORAGE_KEY = "goldstream_theme";

type Theme = "light" | "dark";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}

const navTabClass = ({ isActive }: { isActive: boolean }) => `nav-tab${isActive ? " active" : ""}`;

const navSubTabClass = ({ isActive }: { isActive: boolean }) => `nav-tab nav-tab-sub${isActive ? " active" : ""}`;

function Shell() {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
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

  return (
    <div className="app-shell">
      <div className="shimmer-bar" aria-hidden />
      <header className="app-header">
        <div className="app-logo">⬡ GoldStream Live</div>
        <button
          type="button"
          className="hamburger-btn"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          ☰
        </button>
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
          <NavLink to="/schedule" className={navTabClass}>
            Schedule
          </NavLink>
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
      {mobileNavOpen ? (
        <div className="mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
          <nav
            id="mobile-nav-panel"
            className="mobile-nav-panel"
            aria-label="Main navigation"
            onClick={(e) => e.stopPropagation()}
          >
            {isAdmin ? (
              <>
                <div className="mobile-nav-section-label">Admin</div>
                <NavLink to="/admin/dashboard" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Admin Home
                </NavLink>
                <NavLink to="/admin/dashboard" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Admin Dashboard
                </NavLink>
                <NavLink to="/admin/expenses" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Supplies
                </NavLink>
                <NavLink
                  to="/admin/inventory-management"
                  className={navTabClass}
                  onClick={() => setMobileNavOpen(false)}
                >
              Batch Management
                </NavLink>
                <NavLink to="/admin/orders" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Inventory Management
                </NavLink>
                <NavLink to="/admin/payroll" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Payroll
                </NavLink>
                <NavLink to="/admin/users" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Users
                </NavLink>
                <NavLink to="/admin/schedule" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                  Schedule
                </NavLink>
              </>
            ) : null}
            <div className="mobile-nav-section-label">Main</div>
            <NavLink to="/" end className={navTabClass} onClick={() => setMobileNavOpen(false)}>
              Home
            </NavLink>
            <NavLink to="/streams" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
              Streams
            </NavLink>
            <NavLink to="/schedule" className={navTabClass} onClick={() => setMobileNavOpen(false)}>
              Schedule
            </NavLink>
            {isAdmin ? (
              <NavLink to={STREAMS_LOG_PATH} className={navTabClass} onClick={() => setMobileNavOpen(false)}>
                Stream Log
              </NavLink>
            ) : null}
            <button type="button" className="logout-btn mobile-nav-logout" onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        </div>
      ) : null}
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
            <NavLink to="/admin/dashboard" className={navSubTabClass}>
              Admin Dashboard
            </NavLink>
            <NavLink to="/admin/expenses" className={navSubTabClass}>
              Supplies
            </NavLink>
            <NavLink to="/admin/inventory-management" className={navSubTabClass}>
              Batch Management
            </NavLink>
            <NavLink to="/admin/orders" className={navSubTabClass}>
              Inventory Management
            </NavLink>
            <NavLink to="/admin/payroll" className={navSubTabClass}>
              Payroll
            </NavLink>
            <NavLink to="/admin/users" className={navSubTabClass}>
              Users
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
              element={isAdmin ? <Navigate to="/admin/dashboard" replace /> : <Navigate to="/" replace />}
            />
            <Route
              path="/admin/dashboard"
              element={isAdmin ? <AdminDashboardPage /> : <Navigate to="/" replace />}
            />
            <Route path="/admin/orders" element={isAdmin ? <OrdersPage /> : <Navigate to="/" replace />} />
            <Route
              path="/admin/inventory-management"
              element={isAdmin ? <InventoryMgmtPage /> : <Navigate to="/" replace />}
            />
            <Route path="/admin/users" element={isAdmin ? <AdminUsersPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/expenses" element={isAdmin ? <ExpensesPage /> : <Navigate to="/" replace />} />
            <Route path="/admin/payroll" element={isAdmin ? <PayrollPage /> : <Navigate to="/" replace />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route
              path="/admin/schedule"
              element={isAdmin ? <Navigate to="/schedule" replace /> : <Navigate to="/" replace />}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore quota / private mode */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <>
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      {loading ? (
        <div className="app-loading">Loading…</div>
      ) : !user ? (
        <LoginPage />
      ) : (
        <Shell />
      )}
    </>
  );
}
