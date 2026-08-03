import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import BookingsPage from "./pages/BookingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ServicesPage from "./pages/ServicesPage";
import VendorsPage from "./pages/VendorsPage";

function Protected() {
  const { token, loading } = useAuth();
  if (loading) return <div className="login-page">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Shell() {
  const { user, logout } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>BaseApp</strong>
          <span>
            {isPlatformAdmin ? "Master Admin" : user?.tenant?.name || "Vendor workspace"}
          </span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Overview
          </NavLink>
          {isPlatformAdmin ? (
            <NavLink to="/vendors">Vendors</NavLink>
          ) : (
            <>
              <NavLink to="/bookings">Bookings</NavLink>
              <NavLink to="/conversations">Inbox</NavLink>
              <NavLink to="/services">Services</NavLink>
            </>
          )}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <h2 style={{ margin: 0 }}>{user?.full_name}</h2>
            <p className="muted">
              {user?.email}
              {isPlatformAdmin ? " · platform admin" : " · vendor owner"}
            </p>
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
  const { user } = useAuth();
  if (user?.role === "platform_admin") return <Navigate to="/vendors" replace />;
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
