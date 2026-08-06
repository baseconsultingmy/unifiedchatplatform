import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { BasePrimaryLogo } from "../brand/BaseWordmark";

type Mode = "signin" | "signup";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

const INDUSTRIES = [
  { value: "fnb", label: "Food & Beverage" },
  { value: "health_beauty", label: "Health & Beauty" },
  { value: "retail", label: "Retail" },
  { value: "general", label: "General" },
];

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google script failed")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const { token, login, loginWithToken } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [industry, setIndustry] = useState("fnb");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const signupRef = useRef({ shopName: "", industry: "fnb", mode: "signin" as Mode });

  signupRef.current = { shopName, industry, mode };

  useEffect(() => {
    api
      .socialStatus()
      .then((s) => setGoogleClientId(s.google_enabled ? s.google_client_id : null))
      .catch(() => setGoogleClientId(null));
  }, []);

  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) {
      setGoogleReady(false);
      return;
    }
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential?: string }) => {
            if (!response.credential) {
              setError("Google did not return a credential");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const current = signupRef.current;
              const res = await api.googleAuth({
                credential: response.credential,
                mode: current.mode === "signup" ? "signup" : "login",
                shop_name: current.mode === "signup" ? current.shopName.trim() : undefined,
                industry: current.industry,
              });
              await loginWithToken(res.access_token);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            } finally {
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        googleBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: mode === "signup" ? "signup_with" : "continue_with",
          width: 320,
        });
        setGoogleReady(true);
      })
      .catch((err) => {
        setGoogleReady(false);
        setError(err instanceof Error ? err.message : "Google sign-in unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [googleClientId, mode, loginWithToken]);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      setError("Use Continue with Google to create your shop, or ask BaseApp to enable Google signup.");
      return;
    }
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
              <BasePrimaryLogo width={220} tone="dark" />
            </div>
          </div>
          <p className="login-hero-tagline">
            Counter, bookings, and WhatsApp — one workspace for every vendor.
          </p>
        </aside>

        <form className="login-card form" onSubmit={onSubmit}>
          <div className="login-brand">
            <p className="login-kicker">Base Kiosk OS</p>
            <h1>{mode === "signup" ? "Create your shop" : "Sign in"}</h1>
            <p>
              {mode === "signup"
                ? "Merchants can sign up with Google. Master Admin still manages the platform."
                : "Owners sign in to their shop. Master Admin manages vendors."}
            </p>
          </div>

          <div className="login-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={mode === "signin" ? "active" : ""}
              aria-selected={mode === "signin"}
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              className={mode === "signup" ? "active" : ""}
              aria-selected={mode === "signup"}
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Create shop
            </button>
          </div>

          {mode === "signup" ? (
            <>
              <label>
                Shop name
                <input
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="e.g. Demo Kitchen"
                  required
                />
              </label>
              <label>
                Industry
                <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                  {INDUSTRIES.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
            </>
          )}

          {mode === "signin" ? (
            <button className="btn btn-signal" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          ) : null}

          <div className="login-social">
            {googleClientId ? (
              <>
                <div className="login-divider">
                  <span>{mode === "signup" ? "Continue with Google" : "Or continue with"}</span>
                </div>
                {mode === "signup" && !shopName.trim() ? (
                  <p className="muted">Enter your shop name, then continue with Google.</p>
                ) : null}
                <div
                  ref={googleBtnRef}
                  className={`login-google-btn ${mode === "signup" && !shopName.trim() ? "dim" : ""}`}
                />
                {!googleReady ? <p className="muted">Loading Google…</p> : null}
              </>
            ) : (
              <p className="muted login-social-hint">
                Google sign-up is ready in the product — add <code>GOOGLE_CLIENT_ID</code> on the
                server to turn it on for merchants.
              </p>
            )}
          </div>

          {error ? <div className="error">{error}</div> : null}
          <p className="login-footer muted">Base Consulting</p>
        </form>
      </div>
    </div>
  );
}
