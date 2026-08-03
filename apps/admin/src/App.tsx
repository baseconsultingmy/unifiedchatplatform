import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import BookingsPage from "./pages/BookingsPage";
import ConversationsPage from "./pages/ConversationsPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import ServicesPage from "./pages/ServicesPage";

function Protected() {
  const { token, loading } = useAuth();
  if (loading) return <div className="login-page">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Shell() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>BaseApp</strong>
          <span>{user?.tenant?.name || "Unified bookings"}</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/bookings">Bookings</NavLink>
          <NavLink to="/conversations">Inbox</NavLink>
          <NavLink to="/services">Services</NavLink>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <h2 style={{ margin: 0 }}>{user?.full_name}</h2>
            <p className="muted">{user?.email}</p>
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

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected />}>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="conversations" element={<ConversationsPage />} />
            <Route path="services" element={<ServicesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
