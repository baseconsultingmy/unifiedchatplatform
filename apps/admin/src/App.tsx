import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { BaseAppLogo } from "./brand/BaseWordmark";
import { industryProfile } from "./industry";
import BookingsPage from "./pages/BookingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import PosPage from "./pages/PosPage";
import ResourcesPage from "./pages/ResourcesPage";
import ServicesPage from "./pages/ServicesPage";
import SettingsPage from "./pages/SettingsPage";
import VendorsPage from "./pages/VendorsPage";

function Protected() {
  const { token, loading } = useAuth();
  if (loading) return <div className="login-page">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function HomeRedirect() {
  const { user, impersonating } = useAuth();
  if (user?.role === "platform_admin" && !impersonating) {
    return <Navigate to="/vendors" replace />;
  }
  return <Navigate to="/pos" replace />;
}

function ProfileMenu({
  isPlatformAdmin,
  catalogLabel,
  resourcesLabel,
  supportsResources,
}: {
  isPlatformAdmin: boolean;
  catalogLabel: string;
  resourcesLabel: string;
  supportsResources: boolean;
}) {
  const { user, logout, impersonating, exitViewAs } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onExitViewAs() {
    exitViewAs();
    setOpen(false);
    navigate("/vendors");
  }

  const initials = (user?.full_name || user?.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className={`profile-menu ${open ? "open" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={user?.full_name || "Profile"}
      >
        <span className="profile-avatar">{initials || "•"}</span>
        <span className="profile-trigger-meta">
          <strong>{user?.full_name || "Account"}</strong>
          <span>
            {isPlatformAdmin
              ? "Master Admin"
              : impersonating
                ? user?.tenant?.name || "Vendor"
                : user?.tenant?.name || "Shop"}
          </span>
        </span>
      </button>
      {open ? (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-head">
            <strong>{user?.full_name}</strong>
            <span>{user?.email}</span>
          </div>
          {isPlatformAdmin ? (
            <>
              <NavLink to="/overview" role="menuitem">
                Overview
              </NavLink>
              <NavLink to="/vendors" role="menuitem">
                Vendors
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/overview" role="menuitem">
                Overview
              </NavLink>
              <NavLink to="/customers" role="menuitem">
                Customers
              </NavLink>
              <NavLink to="/services" role="menuitem">
                {catalogLabel}
              </NavLink>
              {supportsResources ? (
                <NavLink to="/resources" role="menuitem">
                  {resourcesLabel}
                </NavLink>
              ) : null}
              <NavLink to="/settings" role="menuitem">
                Settings
              </NavLink>
            </>
          )}
          <div className="profile-dropdown-divider" />
          {impersonating ? (
            <button type="button" className="profile-action" onClick={onExitViewAs}>
              Exit view as
            </button>
          ) : null}
          <button type="button" className="profile-action danger" onClick={logout}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Shell() {
  const { user, impersonating, exitViewAs } = useAuth();
  const navigate = useNavigate();
  const isPlatformAdmin = user?.role === "platform_admin" && !impersonating;
  const catalogLabel = industryProfile(user?.tenant?.industry).catalogNoun;
  const resourcesLabel = industryProfile(user?.tenant?.industry).resourcesNoun;
  const supportsResources = industryProfile(user?.tenant?.industry).supportsResources;

  function onExitViewAs() {
    exitViewAs();
    navigate("/vendors");
  }

  const shopLabel = isPlatformAdmin
    ? "Master Admin"
    : impersonating
      ? user?.tenant?.name || "Vendor"
      : user?.tenant?.name || "BaseApp";

  return (
    <div className="app-shell app-shell-topnav">
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <BaseAppLogo width={168} />
          <div className="brand-meta">
            <span className="app-topbar-shop">{shopLabel}</span>
          </div>
        </div>

        {isPlatformAdmin ? (
          <nav className="app-primary-tabs" aria-label="Primary">
            <NavLink to="/vendors" className="app-tab">
              Vendors
            </NavLink>
            <NavLink to="/overview" className="app-tab">
              Overview
            </NavLink>
          </nav>
        ) : (
          <nav className="app-primary-tabs" aria-label="Primary">
            <NavLink to="/pos" className="app-tab">
              POS
            </NavLink>
            <NavLink to="/conversations" className="app-tab">
              Chat
            </NavLink>
            <NavLink to="/bookings" className="app-tab">
              Bookings
            </NavLink>
          </nav>
        )}

        <div className="app-topbar-right">
          <ProfileMenu
            isPlatformAdmin={isPlatformAdmin}
            catalogLabel={catalogLabel}
            resourcesLabel={resourcesLabel}
            supportsResources={supportsResources}
          />
        </div>
      </header>

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

function PlatformOrVendorOverview() {
  return <DashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected />}>
          <Route element={<Shell />}>
            <Route index element={<HomeRedirect />} />
            <Route path="overview" element={<PlatformOrVendorOverview />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route element={<VendorOnly />}>
              <Route path="bookings" element={<BookingsPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="resources" element={<ResourcesPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
