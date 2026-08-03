import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { industryProfile } from "./industry";
import BookingsPage from "./pages/BookingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import ResourcesPage from "./pages/ResourcesPage";
import ServicesPage from "./pages/ServicesPage";
import VendorsPage from "./pages/VendorsPage";

const SIDEBAR_KEY = "baseapp_sidebar_collapsed";

function Protected() {
  const { token, loading } = useAuth();
  if (loading) return <div className="login-page">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function useCompactLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1100px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

function Shell() {
  const { user, logout, impersonating, exitViewAs } = useAuth();
  const navigate = useNavigate();
  const isPlatformAdmin = user?.role === "platform_admin" && !impersonating;
  const catalogLabel = industryProfile(user?.tenant?.industry).catalogNoun;
  const resourcesLabel = industryProfile(user?.tenant?.industry).resourcesNoun;
  const supportsResources = industryProfile(user?.tenant?.industry).supportsResources;
  const compact = useCompactLayout();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1100px)").matches) {
        return true;
      }
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (compact) setSidebarCollapsed(true);
  }, [compact]);

  useEffect(() => {
    if (compact) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed, compact]);

  function onExitViewAs() {
    exitViewAs();
    navigate("/vendors");
  }

  function closeSidebarIfCompact() {
    if (compact) setSidebarCollapsed(true);
  }

  const shellClass = [
    "app-shell",
    sidebarCollapsed ? "sidebar-collapsed" : "",
    compact ? "compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      {!sidebarCollapsed && compact ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setSidebarCollapsed(true)}
        />
      ) : null}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <strong>BaseApp</strong>
            {!sidebarCollapsed || compact ? (
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
        <nav className="nav" onClick={closeSidebarIfCompact}>
          <NavLink to="/" end title="Overview">
            {sidebarCollapsed && !compact ? "Ov" : "Overview"}
          </NavLink>
          {isPlatformAdmin ? (
            <NavLink to="/vendors" title="Vendors">
              {sidebarCollapsed && !compact ? "Ve" : "Vendors"}
            </NavLink>
          ) : (
            <>
              <NavLink to="/bookings" title="Bookings">
                {sidebarCollapsed && !compact ? "Bk" : "Bookings"}
              </NavLink>
              <NavLink to="/pos" title="POS">
                POS
              </NavLink>
              <NavLink to="/conversations" title="Inbox">
                {sidebarCollapsed && !compact ? "In" : "Inbox"}
              </NavLink>
              <NavLink to="/customers" title="Customers">
                {sidebarCollapsed && !compact ? "Cu" : "Customers"}
              </NavLink>
              <NavLink to="/services" title={catalogLabel}>
                {sidebarCollapsed && !compact ? catalogLabel.slice(0, 2) : catalogLabel}
              </NavLink>
              {supportsResources ? (
                <NavLink to="/resources" title={resourcesLabel}>
                  {sidebarCollapsed && !compact ? "Rs" : resourcesLabel}
                </NavLink>
              ) : null}
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
            {sidebarCollapsed || compact ? (
              <button
                type="button"
                className="btn secondary sidebar-open-btn"
                onClick={() => setSidebarCollapsed(false)}
              >
                Menu
              </button>
            ) : null}
            <div className="topbar-identity">
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
        <div className="page-frame">
          <Outlet />
        </div>
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
              <Route path="customers" element={<CustomersPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="resources" element={<ResourcesPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
