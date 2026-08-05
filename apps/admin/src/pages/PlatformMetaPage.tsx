import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

const WEBHOOK_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp";
const FLOWS_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp/flows";

export default function PlatformMetaPage() {
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;
  const [meta, setMeta] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPlatformAdmin || !token) return;
    api.platformMeta(token).then(setMeta).catch((err) => setError(err.message));
  }, [token, isPlatformAdmin]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              <Link to="/vendors">Vendors</Link> / Platform Meta
            </p>
            <h1>Platform Meta / WhatsApp</h1>
            <p>Shared webhook defaults for every shop.</p>
          </div>
          <Link to="/vendors" className="btn secondary">
            Back to vendors
          </Link>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="detail-grid" style={{ marginTop: "0.35rem" }}>
          <div>
            <span className="muted">App secret</span>
            <div>{meta?.app_secret_set ? "Configured" : "Missing"}</div>
          </div>
          <div>
            <span className="muted">Platform token</span>
            <div>{meta?.platform_access_token_set ? "Fallback on file" : "No fallback"}</div>
          </div>
          <div>
            <span className="muted">Platform phone ID</span>
            <div>{meta?.platform_phone_number_id || "—"}</div>
          </div>
          <div>
            <span className="muted">Flows crypto</span>
            <div>{meta?.flow_crypto_configured ? "Ready" : "Missing private key"}</div>
          </div>
          <div>
            <span className="muted">Grab partner API</span>
            <div>{meta?.grab_credentials_set ? "Credentials on file" : "Dry-run (no creds)"}</div>
          </div>
          <div>
            <span className="muted">Vendors linked</span>
            <div>
              {meta?.vendors_with_phone_id ?? 0} phone · {meta?.vendors_with_token ?? 0} token ·{" "}
              {meta?.vendors_with_flow ?? 0} flow · {meta?.vendors_verified ?? 0} verified ·{" "}
              {meta?.vendors_with_grab ?? 0} Grab
            </div>
          </div>
        </div>

        <div className="pos-confirmed" style={{ marginTop: "1rem" }}>
          <div className="pos-confirmed-head">
            <div>
              <h3>Shared webhook (all shops)</h3>
              <p className="muted">Paste into Meta Developer → WhatsApp → Configuration</p>
            </div>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">Callback URL</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(meta?.webhook_url || WEBHOOK_URL)}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">{meta?.webhook_url || WEBHOOK_URL}</code>
          <div className="pos-receipt-row" style={{ marginTop: "0.55rem" }}>
            <span className="muted">Flows data endpoint</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(meta?.flows_endpoint_url || FLOWS_URL)}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">{meta?.flows_endpoint_url || FLOWS_URL}</code>
          <div className="pos-receipt-row" style={{ marginTop: "0.55rem" }}>
            <span className="muted">Platform verify token</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(meta?.platform_verify_token || "")}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">{meta?.platform_verify_token || "…"}</code>
          <ul className="settings-notes">
            {(meta?.notes || []).map((note: string) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
