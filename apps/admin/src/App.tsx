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
import { BaseMark, BaseWordmark } from "./brand/BaseWordmark";
import { LanguageSwitcher, useT } from "./i18n";
import { industryProfile } from "./industry";
import BookingsPage from "./pages/BookingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import OrdersPage from "./pages/OrdersPage";
import PosPage from "./pages/PosPage";
import ReportsPage from "./pages/ReportsPage";
import ResourcesPage from "./pages/ResourcesPage";
import ServicesPage from "./pages/ServicesPage";
import AccountPage from "./pages/AccountPage";
import SettingsPage from "./pages/SettingsPage";
import VendorsPage from "./pages/VendorsPage";
import VendorCreatePage from "./pages/VendorCreatePage";
import VendorMetaPage from "./pages/VendorMetaPage";
import VendorGrabPage from "./pages/VendorGrabPage";
import PlatformMetaPage from "./pages/PlatformMetaPage";
import EdgePage from "./pages/EdgePage";
import PullToRefresh from "./components/PullToRefresh";

function Protected() {
  const { token, loading } = useAuth();
  const t = useT();
  if (loading) return <div className="login-page">{t("common.loading")}</div>;
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
  const t = useT();
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
        title={user?.full_name || t("nav.account")}
      >
        <span className="profile-avatar">{initials || "•"}</span>
        <span className="profile-trigger-meta">
          <strong>{user?.full_name || t("nav.account")}</strong>
          <span>
            {isPlatformAdmin
              ? t("nav.masterAdmin")
              : impersonating
                ? user?.tenant?.name || t("nav.vendor")
                : user?.tenant?.name || t("nav.shop")}
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
                {t("nav.overview")}
              </NavLink>
              <NavLink to="/vendors" role="menuitem">
                {t("nav.vendors")}
              </NavLink>
              <NavLink to="/edge" role="menuitem">
                {t("nav.edge")}
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/overview" role="menuitem">
                {t("nav.overview")}
              </NavLink>
              <NavLink to="/reports" role="menuitem">
                {t("nav.reports")}
              </NavLink>
              <NavLink to="/customers" role="menuitem">
                {t("nav.customers")}
              </NavLink>
              {industryProfile(user?.tenant?.industry).opsMode === "orders" ? (
                <NavLink to="/orders" role="menuitem">
                  {t("nav.orders")}
                </NavLink>
              ) : null}
              {industryProfile(user?.tenant?.industry).opsMode === "bookings" ? (
                <NavLink to="/bookings" role="menuitem">
                  {t("nav.bookings")}
                </NavLink>
              ) : null}
              <NavLink to="/services" role="menuitem">
                {catalogLabel}
              </NavLink>
              {supportsResources ? (
                <NavLink to="/resources" role="menuitem">
                  {resourcesLabel}
                </NavLink>
              ) : null}
              <NavLink to="/settings" role="menuitem">
                {t("nav.settings")}
              </NavLink>
            </>
          )}
          <NavLink to="/account" role="menuitem">
            {t("nav.account")}
          </NavLink>
          <div className="profile-dropdown-divider" />
          {impersonating ? (
            <button type="button" className="profile-action" onClick={onExitViewAs}>
              {t("nav.exitViewAs")}
            </button>
          ) : null}
          <button type="button" className="profile-action danger" onClick={logout}>
            {t("nav.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Shell() {
  const { user, impersonating, exitViewAs } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const isPlatformAdmin = user?.role === "platform_admin" && !impersonating;
  const profile = industryProfile(user?.tenant?.industry);
  const catalogLabel = t(`industry.catalog_${profile.key}`);
  const resourcesLabel = t(`industry.resources_${profile.key}`);
  const supportsResources = profile.supportsResources;
  const opsMode = profile.opsMode;

  function onExitViewAs() {
    exitViewAs();
    navigate("/vendors");
  }

  const shopLabel = isPlatformAdmin
    ? t("nav.masterAdmin")
    : impersonating
      ? user?.tenant?.name || t("nav.vendor")
      : user?.tenant?.name || "BaseApp";

  return (
    <div className="app-shell app-shell-topnav">
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <BaseMark size={52} />
          <div className="brand-meta">
            <BaseWordmark variant="kiosk-os" />
            <span className={`app-topbar-shop-pill ${isPlatformAdmin ? "is-master" : ""}`}>
              {shopLabel}
            </span>
          </div>
        </div>

        {isPlatformAdmin ? (
          <nav className="app-primary-tabs" aria-label="Primary">
            <NavLink to="/vendors" className="app-tab">
              {t("nav.vendors")}
            </NavLink>
            <NavLink to="/edge" className="app-tab">
              {t("nav.edge")}
            </NavLink>
            <NavLink to="/overview" className="app-tab">
              {t("nav.overview")}
            </NavLink>
          </nav>
        ) : (
          <nav className="app-primary-tabs" aria-label="Primary">
            <NavLink to="/pos" className="app-tab">
              {t("nav.pos")}
            </NavLink>
            <NavLink to="/conversations" className="app-tab">
              {t("nav.chat")}
            </NavLink>
            <NavLink to="/reports" className="app-tab">
              {t("nav.reports")}
            </NavLink>
            {opsMode === "orders" ? (
              <NavLink to="/orders" className="app-tab">
                {t("nav.orders")}
              </NavLink>
            ) : null}
            {opsMode === "bookings" ? (
              <NavLink to="/bookings" className="app-tab">
                {t("nav.bookings")}
              </NavLink>
            ) : null}
            {opsMode === "retail" ? (
              <NavLink to="/customers" className="app-tab">
                {t("nav.customers")}
              </NavLink>
            ) : null}
          </nav>
        )}

        <div className="app-topbar-right">
          <LanguageSwitcher />
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
              <strong>{t("nav.viewingAs")}</strong>
              <span>
                {user?.tenant?.name} · {user?.email}
                {user?.impersonator_email ? ` · via ${user.impersonator_email}` : ""}
              </span>
            </div>
            <button className="btn secondary" onClick={onExitViewAs}>
              {t("nav.exitViewAs")}
            </button>
          </div>
        ) : null}
        <div className="page-frame">
          <PullToRefresh>
            <Outlet />
          </PullToRefresh>
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

function OpsAwareBookings() {
  const { user } = useAuth();
  const ops = industryProfile(user?.tenant?.industry).opsMode;
  if (ops === "orders") return <Navigate to="/orders" replace />;
  if (ops === "retail") return <Navigate to="/pos" replace />;
  return <BookingsPage />;
}

function OpsAwareOrders() {
  const { user } = useAuth();
  const ops = industryProfile(user?.tenant?.industry).opsMode;
  if (ops === "orders") return <OrdersPage />;
  if (ops === "bookings") return <Navigate to="/bookings" replace />;
  return <Navigate to="/pos" replace />;
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
            <Route path="vendors/new" element={<VendorCreatePage />} />
            <Route path="vendors/platform" element={<PlatformMetaPage />} />
            <Route path="vendors/:id/meta" element={<VendorMetaPage />} />
            <Route path="vendors/:id/grab" element={<VendorGrabPage />} />
            <Route path="edge" element={<EdgePage />} />
            <Route path="account" element={<AccountPage />} />
            <Route element={<VendorOnly />}>
              <Route path="bookings" element={<OpsAwareBookings />} />
              <Route path="orders" element={<OpsAwareOrders />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="reports" element={<ReportsPage />} />
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
