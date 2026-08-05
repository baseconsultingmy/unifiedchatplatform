import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

const WEBHOOK_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp";
const FLOWS_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp/flows";

function isFnbIndustry(raw?: string | null) {
  const v = (raw || "").toLowerCase();
  return v === "fnb" || v === "food" || v === "food_beverage";
}

export default function VendorMetaPage() {
  const { id } = useParams();
  const vendorId = Number(id);
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  const [vendor, setVendor] = useState<any | null>(null);
  const [meta, setMeta] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    wa_phone_number_id: "",
    wa_access_token: "",
    clear_wa_access_token: false,
    wa_business_account_id: "",
    wa_flow_id: "",
    wa_display_phone: "",
    wa_verify_token: "",
  });

  useEffect(() => {
    if (!isPlatformAdmin || !token || !vendorId) return;
    Promise.all([api.vendors(token), api.platformMeta(token)])
      .then(([list, platform]) => {
        const v = list.find((x: any) => x.id === vendorId);
        if (!v) {
          setError("Vendor not found");
          return;
        }
        setVendor(v);
        setMeta(platform);
        setForm({
          wa_phone_number_id: v.wa_phone_number_id || "",
          wa_access_token: "",
          clear_wa_access_token: false,
          wa_business_account_id: v.wa_business_account_id || "",
          wa_flow_id: v.wa_flow_id || "",
          wa_display_phone: v.wa_display_phone || "",
          wa_verify_token: v.wa_verify_token || "",
        });
      })
      .catch((err) => setError(err.message));
  }, [token, isPlatformAdmin, vendorId]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (!vendorId) return <Navigate to="/vendors" replace />;

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  const effectiveVerify =
    (form.wa_verify_token || meta?.platform_verify_token || "").trim() || "baseapp-wa-verify";

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !vendor) return;
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        wa_phone_number_id: form.wa_phone_number_id.trim() || null,
        wa_business_account_id: form.wa_business_account_id.trim() || null,
        wa_flow_id: form.wa_flow_id.trim() || null,
        wa_display_phone: form.wa_display_phone.trim() || null,
        wa_verify_token: form.wa_verify_token.trim() || null,
        clear_wa_access_token: form.clear_wa_access_token,
      };
      if (form.wa_access_token.trim()) body.wa_access_token = form.wa_access_token.trim();
      const updated = await api.updateVendor(token, vendor.id, body);
      setVendor(updated);
      setForm((f) => ({
        ...f,
        wa_access_token: "",
        clear_wa_access_token: false,
        wa_flow_id: updated.wa_flow_id || "",
      }));
      setSaved("WhatsApp / Meta settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Meta setup");
    } finally {
      setBusy(false);
    }
  }

  async function publishBookingFlow() {
    if (!token || !vendor) return;
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const updated = await api.publishVendorFlow(token, vendor.id);
      setVendor(updated);
      setForm((f) => ({ ...f, wa_flow_id: updated.wa_flow_id || "" }));
      setSaved(`Booking Flow published · id ${updated.wa_flow_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish Flow");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel" style={{ maxWidth: 720 }}>
        <div className="bookings-toolbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              <Link to="/vendors">Vendors</Link> / Meta
            </p>
            <h1>Meta / WhatsApp{vendor ? ` — ${vendor.name}` : ""}</h1>
            <p className="muted">
              Status: {vendor?.wa_webhook_status || "…"}
              {vendor?.wa_access_token_set ? " · token on file" : " · no shop token"}
            </p>
          </div>
          <div className="vendor-toolbar-actions">
            {vendor && isFnbIndustry(vendor.industry) ? (
              <Link to={`/vendors/${vendor.id}/grab`} className="btn secondary">
                Grab setup
              </Link>
            ) : null}
            <Link to="/vendors" className="btn secondary">
              Back
            </Link>
          </div>
        </div>

        {!vendor && !error ? <p className="muted">Loading…</p> : null}

        {vendor ? (
          <form className="form" onSubmit={onSave} style={{ display: "grid", gap: "0.75rem" }}>
            <label>
              Display phone
              <input
                value={form.wa_display_phone}
                onChange={(e) => setForm((f) => ({ ...f, wa_display_phone: e.target.value }))}
                placeholder="+60 12-345 6789"
              />
            </label>
            <label>
              Phone number ID
              <input
                value={form.wa_phone_number_id}
                onChange={(e) => setForm((f) => ({ ...f, wa_phone_number_id: e.target.value }))}
                placeholder="From Meta → WhatsApp → API Setup"
              />
            </label>
            <label>
              WhatsApp Business Account ID
              <input
                value={form.wa_business_account_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wa_business_account_id: e.target.value }))
                }
                placeholder="Required to publish in-chat booking Flow"
              />
            </label>
            <label>
              Booking Flow ID
              <input
                value={form.wa_flow_id}
                onChange={(e) => setForm((f) => ({ ...f, wa_flow_id: e.target.value }))}
                placeholder="Auto-filled by Publish, or paste from Meta"
              />
            </label>
            <label>
              Permanent access token
              <input
                type="password"
                value={form.wa_access_token}
                onChange={(e) => setForm((f) => ({ ...f, wa_access_token: e.target.value }))}
                placeholder={
                  vendor.wa_access_token_set
                    ? "Leave blank to keep current token"
                    : "System user token"
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.clear_wa_access_token}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clear_wa_access_token: e.target.checked }))
                }
              />
              Clear saved access token
            </label>
            <label>
              Webhook verify token (optional override)
              <input
                value={form.wa_verify_token}
                onChange={(e) => setForm((f) => ({ ...f, wa_verify_token: e.target.value }))}
                placeholder="Defaults to platform WA_VERIFY_TOKEN"
              />
            </label>

            <div className="pos-receipt-row">
              <span className="muted">Callback URL</span>
              <button type="button" className="btn secondary" onClick={() => copyText(WEBHOOK_URL)}>
                Copy
              </button>
            </div>
            <code className="settings-code">{WEBHOOK_URL}</code>
            <div className="pos-receipt-row" style={{ marginTop: "0.35rem" }}>
              <span className="muted">Flows endpoint</span>
              <button type="button" className="btn secondary" onClick={() => copyText(FLOWS_URL)}>
                Copy
              </button>
            </div>
            <code className="settings-code">{FLOWS_URL}</code>
            <div className="pos-receipt-row" style={{ marginTop: "0.35rem" }}>
              <span className="muted">Effective verify token</span>
              <button
                type="button"
                className="btn secondary"
                onClick={() => copyText(effectiveVerify)}
              >
                Copy
              </button>
            </div>
            <code className="settings-code">{effectiveVerify}</code>

            {error ? <div className="error">{error}</div> : null}
            {saved ? <p className="muted">{saved}</p> : null}

            <div className="vendor-toolbar-actions">
              <button type="submit" className="btn" disabled={busy}>
                {busy ? "Saving…" : "Save Meta setup"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || !form.wa_business_account_id.trim()}
                onClick={publishBookingFlow}
              >
                Publish booking Flow
              </button>
            </div>
          </form>
        ) : error ? (
          <div className="error">{error}</div>
        ) : null}
      </section>
    </div>
  );
}
