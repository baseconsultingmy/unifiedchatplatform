import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";
import { useT } from "../i18n";

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
  const t = useT();
  const { token, user } = useAuth();
  const [setup, setSetup] = useState<any | null>(null);
  const [grab, setGrab] = useState<any | null>(null);
  const [line, setLine] = useState<any | null>(null);
  const [form, setForm] = useState<WaForm>(emptyWa);
  const [shopName, setShopName] = useState("");
  const [grabMerchantId, setGrabMerchantId] = useState("");
  const [lineChannelId, setLineChannelId] = useState("");
  const [lineSecret, setLineSecret] = useState("");
  const [lineToken, setLineToken] = useState("");
  const [lineLiffId, setLineLiffId] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [grabMsg, setGrabMsg] = useState("");
  const [lineMsg, setLineMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [grabBusy, setGrabBusy] = useState(false);
  const [lineBusy, setLineBusy] = useState(false);

  const isFnb = industryProfile(user?.tenant?.industry).key === "fnb";

  async function refresh() {
    if (!token) return;
    const [workspace, wa, lineStatus] = await Promise.all([
      api.workspace(token),
      api.whatsappSetup(token),
      api.lineStatus(token).catch(() => null),
    ]);
    setShopName(workspace.name || "");
    setGrabMerchantId(workspace.grab_merchant_id || "");
    setLine(lineStatus);
    setLineChannelId(lineStatus?.channel_id || workspace.line_channel_id || "");
    setLineLiffId(lineStatus?.liff_id || workspace.line_liff_id || "");
    setLineSecret("");
    setLineToken("");
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
    if (isFnb || workspace.industry === "fnb" || workspace.industry === "food") {
      setGrab(await api.grabStatus(token));
    }
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
      }
      body.line_channel_id = lineChannelId.trim() || null;
      body.line_liff_id = lineLiffId.trim() || null;
      if (lineSecret.trim()) body.line_channel_secret = lineSecret.trim();
      if (lineToken.trim()) body.line_channel_access_token = lineToken.trim();
      await api.updateWorkspace(token, body);
      setSaved("Settings saved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  async function onConnectGrab() {
    if (!token) return;
    setGrabBusy(true);
    setError("");
    setGrabMsg("");
    try {
      const res = await api.connectGrab(token);
      setGrabMsg(
        `${res.message}${res.activation_url ? " — open the activation link below." : ""}`,
      );
      if (res.activation_url) {
        window.open(res.activation_url, "_blank", "noopener,noreferrer");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Grab connect");
    } finally {
      setGrabBusy(false);
    }
  }

  async function onPublishGrab() {
    if (!token) return;
    setGrabBusy(true);
    setError("");
    setGrabMsg("");
    try {
      const res = await api.publishGrabMenu(token);
      setGrabMsg(res.ok ? res.message || "Menu published" : res.message || "Publish failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setGrabBusy(false);
    }
  }

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <h1 style={{ margin: 0 }}>{t("settings.title")}</h1>
      {isFnb ? (
        <section className="panel order-card channel-grab" style={{ padding: "1rem 1.1rem" }}>
          <div className="bookings-toolbar">
            <div>
              <div className="order-card-title">
                <span className="order-channel-pill channel-grab">Grab</span>
                <h1 style={{ margin: 0, fontSize: "1.35rem" }}>{t("settings.grabFood")}</h1>
              </div>
              <p>
                Connect your GrabFood outlet to BaseApp, then publish the menu. Orders land under
                the Orders tab.
              </p>
            </div>
            <span className={`badge ${grab?.connected ? "" : "warn"}`}>
              {grab?.connected ? "Connected" : grab?.configured ? "Pending" : "Not connected"}
            </span>
          </div>

          <div className="detail-grid" style={{ marginTop: "0.35rem" }}>
            <div>
              <span className="muted">Partner merchant ID</span>
              <div>
                <strong>{grab?.partner_merchant_id || user?.tenant?.slug || "—"}</strong>
              </div>
            </div>
            <div>
              <span className="muted">Grab merchant ID</span>
              <div>{grab?.merchant_id || grabMerchantId || "—"}</div>
            </div>
            <div>
              <span className="muted">Last synced</span>
              <div>
                {grab?.last_synced_at
                  ? new Date(grab.last_synced_at).toLocaleString()
                  : "Never"}
              </div>
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={grabBusy} onClick={onConnectGrab}>
              {grabBusy ? "Working…" : "Connect Grab"}
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={grabBusy}
              onClick={onPublishGrab}
            >
              Publish menu
            </button>
            {grab?.activation_url ? (
              <a
                className="btn secondary"
                href={grab.activation_url}
                target="_blank"
                rel="noreferrer"
              >
                Open activation link
              </a>
            ) : null}
          </div>

          {grabMsg ? <p className="muted" style={{ marginTop: "0.65rem" }}>{grabMsg}</p> : null}

          {grab?.activation_url ? (
            <div style={{ marginTop: "0.75rem" }}>
              <div className="pos-receipt-row">
                <span className="muted">Activation URL</span>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => copyText(grab.activation_url)}
                >
                  Copy
                </button>
              </div>
              <code className="settings-code">{grab.activation_url}</code>
            </div>
          ) : null}

          <div className="detail-grid" style={{ marginTop: "0.85rem" }}>
            <div>
              <span className="muted">Menu pull URL</span>
              <div className="muted" style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>
                {grab?.menu_webhook_url || "…"}
              </div>
            </div>
            <div>
              <span className="muted">Orders webhook</span>
              <div className="muted" style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>
                {grab?.orders_webhook_url || "…"}
              </div>
            </div>
          </div>

          <ul className="settings-notes">
            {(grab?.notes || []).map((note: string) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid split-2">
        <section className="panel">
          <div className="bookings-toolbar">
            <div>
              <h1>{t("settings.whatsappMeta")}</h1>
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
        </section>

        <form className="panel form" onSubmit={onSave}>
          <h2>{t("settings.shopCredentials")}</h2>
          <p className="muted">
            Owners can self-serve WhatsApp, LINE
            {isFnb ? ", and Grab Food" : ""} without waiting on Master Admin.
          </p>

          <label>
            {t("settings.shopName")}
            <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </label>

          {isFnb ? (
            <>
              <h3 style={{ marginTop: "0.5rem" }}>{t("settings.grabFood")}</h3>
              <label>
                Grab merchant ID
                <input
                  value={grabMerchantId}
                  onChange={(e) => setGrabMerchantId(e.target.value)}
                  placeholder="From Grab after Enable Integration"
                />
              </label>
              <p className="muted">
                Use <strong>Connect Grab</strong> above to start activation, then paste the merchant
                ID Grab shows after linking.
              </p>
            </>
          ) : null}

          <h3 style={{ marginTop: "0.75rem" }}>LINE Messaging</h3>
          <p className="muted">
            Status: {line?.webhook_status || "not_configured"}
            {line?.access_token_set ? " · token on file" : " · no access token"}
            {line?.channel_secret_set ? " · secret on file" : ""}
          </p>
          <label>
            Channel ID
            <input
              value={lineChannelId}
              onChange={(e) => setLineChannelId(e.target.value)}
              placeholder="From LINE Developers → Messaging API"
            />
          </label>
          <label>
            Channel secret
            <input
              type="password"
              value={lineSecret}
              onChange={(e) => setLineSecret(e.target.value)}
              placeholder={line?.channel_secret_set ? "Leave blank to keep current" : "Channel secret"}
            />
          </label>
          <label>
            Channel access token
            <input
              type="password"
              value={lineToken}
              onChange={(e) => setLineToken(e.target.value)}
              placeholder={
                line?.access_token_set ? "Leave blank to keep current" : "Long-lived channel access token"
              }
            />
          </label>
          <label>
            LIFF ID (optional mini-app)
            <input
              value={lineLiffId}
              onChange={(e) => setLineLiffId(e.target.value)}
              placeholder="From LINE Developers → LIFF"
            />
          </label>
          <p className="muted">
            Chat booking works without LIFF (type <strong>menu</strong> / <strong>book</strong>). LIFF adds a
            tap-through mini-app. Endpoint URL:
          </p>
          <div className="pos-receipt-row">
            <span className="muted">Webhook URL</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() => copyText(line?.webhook_url || "https://api.baseapp.asia/v1/webhooks/line")}
            >
              Copy
            </button>
          </div>
          <code className="settings-code">
            {line?.webhook_url || "https://api.baseapp.asia/v1/webhooks/line"}
          </code>
          <div className="pos-receipt-row">
            <span className="muted">LIFF endpoint</span>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                copyText(line?.liff_endpoint_url || "https://api.baseapp.asia/liff/your-slug")
              }
            >
              Copy
            </button>
          </div>
          <code className="settings-code">
            {line?.liff_endpoint_url || "https://api.baseapp.asia/liff/your-slug"}
          </code>
          {lineMsg ? <p className="muted">{lineMsg}</p> : null}
          <button
            type="button"
            className="btn secondary"
            disabled={lineBusy}
            onClick={async () => {
              if (!token) return;
              setLineBusy(true);
              setLineMsg("");
              try {
                const body: Record<string, unknown> = {
                  line_channel_id: lineChannelId.trim() || null,
                  line_liff_id: lineLiffId.trim() || null,
                };
                if (lineSecret.trim()) body.line_channel_secret = lineSecret.trim();
                if (lineToken.trim()) body.line_channel_access_token = lineToken.trim();
                const updated = await api.updateLineSettings(token, body);
                setLine(updated);
                setLineMsg("LINE settings saved");
                setLineSecret("");
                setLineToken("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save LINE settings");
              } finally {
                setLineBusy(false);
              }
            }}
          >
            {lineBusy ? "Saving…" : "Save LINE only"}
          </button>

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
            {busy ? t("common.saving") : t("settings.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
