import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

type WaForm = {
  wa_display_phone: string;
  wa_phone_number_id: string;
  wa_business_account_id: string;
  wa_flow_id: string;
  wa_access_token: string;
  clear_wa_access_token: boolean;
  wa_verify_token: string;
};

const emptyWa: WaForm = {
  wa_display_phone: "",
  wa_phone_number_id: "",
  wa_business_account_id: "",
  wa_flow_id: "",
  wa_access_token: "",
  clear_wa_access_token: false,
  wa_verify_token: "",
};

export default function SettingsPage() {
  const { token, user } = useAuth();
  const [setup, setSetup] = useState<any | null>(null);
  const [form, setForm] = useState<WaForm>(emptyWa);
  const [shopName, setShopName] = useState("");
  const [grabMerchantId, setGrabMerchantId] = useState("");
  const [grabMarkup, setGrabMarkup] = useState(30);
  const [grabSync, setGrabSync] = useState("not_configured");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  const isFnb = industryProfile(user?.tenant?.industry).key === "fnb";

  async function refresh() {
    if (!token) return;
    const [workspace, wa] = await Promise.all([
      api.workspace(token),
      api.whatsappSetup(token),
    ]);
    setShopName(workspace.name || "");
    setGrabMerchantId(workspace.grab_merchant_id || "");
    setGrabMarkup(Number(workspace.grab_markup_percent ?? 30));
    setGrabSync(workspace.grab_sync_status || "not_configured");
    setSetup(wa);
    setForm({
      wa_display_phone: workspace.wa_display_phone || "",
      wa_phone_number_id: workspace.wa_phone_number_id || "",
      wa_business_account_id: workspace.wa_business_account_id || "",
      wa_flow_id: workspace.wa_flow_id || "",
      wa_access_token: "",
      clear_wa_access_token: false,
      wa_verify_token: workspace.wa_verify_token || "",
    });
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const body: Record<string, unknown> = {
        name: shopName.trim() || undefined,
        wa_display_phone: form.wa_display_phone.trim() || null,
        wa_phone_number_id: form.wa_phone_number_id.trim() || null,
        wa_business_account_id: form.wa_business_account_id.trim() || null,
        wa_flow_id: form.wa_flow_id.trim() || null,
        wa_verify_token: form.wa_verify_token.trim() || null,
        clear_wa_access_token: form.clear_wa_access_token,
      };
      if (form.wa_access_token.trim()) {
        body.wa_access_token = form.wa_access_token.trim();
      }
      if (isFnb) {
        body.grab_merchant_id = grabMerchantId.trim() || null;
        body.grab_markup_percent = grabMarkup;
      }
      await api.updateWorkspace(token, body);
      setSaved(isFnb ? "Settings saved" : "WhatsApp settings saved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  return (
    <div className="grid split-2 page-scroll">
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>WhatsApp / Meta</h1>
            <p>
              Connect your shop’s WhatsApp Business number so customers can book and receive
              receipts on WhatsApp.
            </p>
          </div>
          <span className={`badge ${setup?.phone_number_id ? "" : "warn"}`}>
            {setup?.webhook_status || "not_configured"}
          </span>
        </div>

        <div className="detail-grid" style={{ marginTop: "0.5rem" }}>
          <div>
            <span className="muted">Shop</span>
            <div>
              <strong>{user?.tenant?.name}</strong>
            </div>
          </div>
          <div>
            <span className="muted">Shop access token</span>
            <div>{setup?.access_token_set ? "On file" : "Missing"}</div>
          </div>
          <div>
            <span className="muted">Phone number ID</span>
            <div>{setup?.phone_number_id || "—"}</div>
          </div>
          <div>
            <span className="muted">Display phone</span>
            <div>{setup?.display_phone || "—"}</div>
          </div>
          <div>
            <span className="muted">Booking Flow ID</span>
            <div>{setup?.flow_id || "Not published"}</div>
          </div>
          <div>
            <span className="muted">Flows crypto</span>
            <div>{setup?.flow_crypto_configured ? "Ready" : "Server key missing"}</div>
          </div>
        </div>

        {setup?.using_platform_fallback ? (
          <div className="error" style={{ marginTop: "0.85rem" }}>
            Currently using platform Meta credentials as a fallback. Add your own Phone number ID
            and token to isolate this shop.
          </div>
        ) : null}

        <div className="pos-confirmed" style={{ marginTop: "1rem" }}>
          <div className="pos-confirmed-head">
            <div>
              <h3>Meta webhook</h3>
              <p className="muted">Paste these into Meta Developer → WhatsApp → Configuration</p>
            </div>
          </div>
          <div className="pos-receipt-row">
            <span className="muted">Callback URL</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(setup?.webhook_url || "")}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">{setup?.webhook_url || "…"}</code>
          <div className="pos-receipt-row" style={{ marginTop: "0.55rem" }}>
            <span className="muted">Flows data endpoint</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(setup?.flows_endpoint_url || "")}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">{setup?.flows_endpoint_url || "…"}</code>
          <div className="pos-receipt-row" style={{ marginTop: "0.55rem" }}>
            <span className="muted">Verify token</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(setup?.verify_token || "")}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">{setup?.verify_token || "…"}</code>
          <ul className="settings-notes">
            {(setup?.notes || []).map((note: string) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>

        {isFnb ? (
          <div className="pos-confirmed" style={{ marginTop: "1rem" }}>
            <div className="pos-confirmed-head">
              <div>
                <h3>Grab Food</h3>
                <p className="muted">
                  Menu publish + order webhooks. Without Grab partner credentials the panel runs in
                  dry-run.
                </p>
              </div>
              <span className="badge">{grabSync}</span>
            </div>
            <div className="detail-grid">
              <div>
                <span className="muted">Merchant ID</span>
                <div>{grabMerchantId || "—"}</div>
              </div>
              <div>
                <span className="muted">Default markup</span>
                <div>{grabMarkup}%</div>
              </div>
              <div>
                <span className="muted">Menu pull URL</span>
                <div className="muted" style={{ wordBreak: "break-all" }}>
                  /v1/webhooks/grab/merchant/menu
                </div>
              </div>
              <div>
                <span className="muted">Orders webhook</span>
                <div className="muted" style={{ wordBreak: "break-all" }}>
                  /v1/webhooks/grab/orders
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <form className="panel form" onSubmit={onSave}>
        <h2>Shop credentials</h2>
        <p className="muted">
          Owners can self-serve WhatsApp
          {isFnb ? " and Grab Food" : ""} without waiting on Master Admin.
        </p>

        <label>
          Shop name
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
        </label>

        {isFnb ? (
          <>
            <h3 style={{ marginTop: "0.5rem" }}>Grab Food</h3>
            <label>
              Grab merchant ID
              <input
                value={grabMerchantId}
                onChange={(e) => setGrabMerchantId(e.target.value)}
                placeholder="Grab partner merchant ID"
              />
            </label>
            <label>
              Default Grab markup (%)
              <input
                type="number"
                min={0}
                max={500}
                step={1}
                value={grabMarkup}
                onChange={(e) => setGrabMarkup(Number(e.target.value))}
              />
            </label>
            <p className="muted">
              Walk-in stays at menu price. Grab = override, or walk-in × (1 + markup%), rounded to
              .00 / .50.
            </p>
          </>
        ) : null}

        <h3 style={{ marginTop: "0.75rem" }}>WhatsApp</h3>
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
            placeholder="Meta → WhatsApp → API Setup"
            required
          />
        </label>
        <label>
          WhatsApp Business Account ID
          <input
            value={form.wa_business_account_id}
            onChange={(e) => setForm((f) => ({ ...f, wa_business_account_id: e.target.value }))}
            placeholder="From Meta Business → WhatsApp accounts"
          />
        </label>
        <label>
          Booking Flow ID
          <input
            value={form.wa_flow_id}
            onChange={(e) => setForm((f) => ({ ...f, wa_flow_id: e.target.value }))}
            placeholder="Published by Master Admin, or paste from Meta"
          />
        </label>
        <label>
          Permanent access token
          <input
            type="password"
            value={form.wa_access_token}
            onChange={(e) => setForm((f) => ({ ...f, wa_access_token: e.target.value }))}
            placeholder={
              setup?.access_token_set ? "Leave blank to keep current token" : "System user token"
            }
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.clear_wa_access_token}
            onChange={(e) => setForm((f) => ({ ...f, clear_wa_access_token: e.target.checked }))}
          />
          Clear saved access token
        </label>
        <label>
          Custom verify token (optional)
          <input
            value={form.wa_verify_token}
            onChange={(e) => setForm((f) => ({ ...f, wa_verify_token: e.target.value }))}
            placeholder="Leave blank to use platform default"
          />
        </label>

        {error ? <div className="error">{error}</div> : null}
        {saved ? <div className="pos-receipt ok">{saved}</div> : null}
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
