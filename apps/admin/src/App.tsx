import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import BookingsPage from "./pages/BookingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import ServicesPage from "./pages/ServicesPage";
import VendorsPage from "./pages/VendorsPage";

const SIDEBAR_KEY = "baseapp_sidebar_collapsed";

function Protected() {
  const { token, loading } = useAuth();
  if (loading) return <div className="login-page">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Shell() {
  const { user, logout, impersonating, exitViewAs } = useAuth();
  const navigate = useNavigate();
  const isPlatformAdmin = user?.role === "platform_admin" && !impersonating;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  function onExitViewAs() {
    exitViewAs();
    navigate("/vendors");
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <strong>BaseApp</strong>
            {!sidebarCollapsed ? (
              <span>
                {isPlatformAdmin
                  ? "Master Admin"
                  : impersonating
                    ? `Viewing: ${user?.tenant?.name || "vendor"}`
                    : user?.tenant?.name || "Vendor workspace"}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand" : "Collapse"}
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="nav">
          <NavLink to="/" end title="Overview">
            {sidebarCollapsed ? "Ov" : "Overview"}
          </NavLink>
          {isPlatformAdmin ? (
            <NavLink to="/vendors" title="Vendors">
              {sidebarCollapsed ? "Ve" : "Vendors"}
            </NavLink>
          ) : (
            <>
              <NavLink to="/bookings" title="Bookings">
                {sidebarCollapsed ? "Bk" : "Bookings"}
              </NavLink>
              <NavLink to="/pos" title="POS">
                {sidebarCollapsed ? "POS" : "POS"}
              </NavLink>
              <NavLink to="/conversations" title="Inbox">
                {sidebarCollapsed ? "In" : "Inbox"}
              </NavLink>
              <NavLink to="/services" title="Services">
                {sidebarCollapsed ? "Sv" : "Services"}
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <main className="main">
        {impersonating ? (
          <div className="impersonation-banner">
            <div>
              <strong>Viewing as vendor</strong>
              <span>
                {user?.tenant?.name} · {user?.email}
                {user?.impersonator_email ? ` · via ${user.impersonator_email}` : ""}
              </span>
            </div>
            <button className="btn secondary" onClick={onExitViewAs}>
              Exit view as
            </button>
          </div>
        ) : null}
        <div className="topbar">
          <div className="topbar-left">
            {sidebarCollapsed ? (
              <button
                type="button"
                className="btn secondary sidebar-open-btn"
                onClick={() => setSidebarCollapsed(false)}
              >
                Menu
              </button>
            ) : null}
            <div>
              <h2 style={{ margin: 0 }}>{user?.full_name}</h2>
              <p className="muted">
                {user?.email}
                {isPlatformAdmin
                  ? " · platform admin"
                  : impersonating
                    ? " · view-as mode"
                    : " · vendor owner"}
              </p>
            </div>
          </div>
          <button className="btn secondary" onClick={logout}>
            Sign out
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

function VendorOnly() {
  const { user, impersonating } = useAuth();
  if (user?.role === "platform_admin" && !impersonating) {
    return <Navigate to="/vendors" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected />}>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route element={<VendorOnly />}>
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="services" element={<ServicesPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
