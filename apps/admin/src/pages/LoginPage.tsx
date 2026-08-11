import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { BaseAppLogo } from "../brand/BaseWordmark";

export default function LoginPage() {
  const { token, login } = useAuth();
  const [email, setEmail] = useState("admin@baseapp.asia");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-stage">
        <aside className="login-hero">
          <div className="login-hero-glow" aria-hidden />
          <div className="login-hero-brand">
            <div className="login-primary-logo">
              <BaseAppLogo width={240} />
            </div>
          </div>
          <p className="login-hero-tagline">
            Counter, bookings, and WhatsApp — one workspace for every vendor.
          </p>
        </aside>

        <form className="login-card form" onSubmit={onSubmit}>
          <div className="login-brand">
            <h1>Sign in</h1>
            <p>Master Admin manages vendors. Vendor owners manage their own shop.</p>
          </div>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button className="btn btn-signal" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="login-footer muted">Base Consulting</p>
        </form>
      </div>
    </div>
  );
}
