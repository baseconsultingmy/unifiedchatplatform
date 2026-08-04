import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type WaForm = {
  wa_phone_number_id: string;
  wa_access_token: string;
  clear_wa_access_token: boolean;
  wa_business_account_id: string;
  wa_flow_id: string;
  wa_display_phone: string;
  wa_verify_token: string;
};

type GrabForm = {
  grab_merchant_id: string;
  grab_markup_percent: number;
};

const emptyWa: WaForm = {
  wa_phone_number_id: "",
  wa_access_token: "",
  clear_wa_access_token: false,
  wa_business_account_id: "",
  wa_flow_id: "",
  wa_display_phone: "",
  wa_verify_token: "",
};

const emptyGrab: GrabForm = {
  grab_merchant_id: "",
  grab_markup_percent: 30,
};

function isFnbIndustry(raw?: string | null) {
  const v = (raw || "").toLowerCase();
  return v === "fnb" || v === "food" || v === "food_beverage";
}

const WEBHOOK_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp";
const FLOWS_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp/flows";

export default function VendorsPage() {
  const { token, user, viewAsVendor } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [meta, setMeta] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editPanel, setEditPanel] = useState<"meta" | "grab">("meta");
  const [waForm, setWaForm] = useState<WaForm>(emptyWa);
  const [grabForm, setGrabForm] = useState<GrabForm>(emptyGrab);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("health_beauty");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [country, setCountry] = useState("MY");
  const [createWaPhoneId, setCreateWaPhoneId] = useState("");

  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  async function refresh() {
    if (!token) return;
    const [list, platform] = await Promise.all([
      api.vendors(token),
      api.platformMeta(token),
    ]);
    setVendors(list);
    setMeta(platform);
  }

  useEffect(() => {
    if (!isPlatformAdmin) return;
    refresh().catch((err) => setError(err.message));
  }, [token, isPlatformAdmin]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setSaved("");
    try {
      await api.createVendor(token, {
        name,
        industry,
        country,
        owner_full_name: ownerName,
        owner_email: ownerEmail,
        owner_password: ownerPassword,
        wa_phone_number_id: createWaPhoneId.trim() || null,
      });
      setName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      setCreateWaPhoneId("");
      setSaved("Vendor created");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create vendor");
    }
  }

  function openMetaSetup(vendor: any) {
    setEditing(vendor);
    setEditPanel("meta");
    setWaForm({
      wa_phone_number_id: vendor.wa_phone_number_id || "",
      wa_access_token: "",
      clear_wa_access_token: false,
      wa_business_account_id: vendor.wa_business_account_id || "",
      wa_flow_id: vendor.wa_flow_id || "",
      wa_display_phone: vendor.wa_display_phone || "",
      wa_verify_token: vendor.wa_verify_token || "",
    });
    setGrabForm({
      grab_merchant_id: vendor.grab_merchant_id || "",
      grab_markup_percent: Number(vendor.grab_markup_percent ?? 30),
    });
    setError("");
    setSaved("");
  }

  function openGrabSetup(vendor: any) {
    openMetaSetup(vendor);
    setEditPanel("grab");
  }

  async function saveMetaSetup(e: FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
    setError("");
    setSaved("");
    setBusyId(editing.id);
    try {
      const body: Record<string, unknown> = {
        wa_phone_number_id: waForm.wa_phone_number_id.trim() || null,
        wa_business_account_id: waForm.wa_business_account_id.trim() || null,
        wa_flow_id: waForm.wa_flow_id.trim() || null,
        wa_display_phone: waForm.wa_display_phone.trim() || null,
        wa_verify_token: waForm.wa_verify_token.trim() || null,
        clear_wa_access_token: waForm.clear_wa_access_token,
      };
      if (waForm.wa_access_token.trim()) {
        body.wa_access_token = waForm.wa_access_token.trim();
      }
      const updated = await api.updateVendor(token, editing.id, body);
      setEditing(updated);
      setWaForm((f) => ({
        ...f,
        wa_access_token: "",
        clear_wa_access_token: false,
        wa_flow_id: updated.wa_flow_id || "",
      }));
      setSaved("WhatsApp / Meta settings saved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Meta setup");
    } finally {
      setBusyId(null);
    }
  }

  async function saveGrabSetup(e: FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
    setError("");
    setSaved("");
    setBusyId(editing.id);
    try {
      const updated = await api.updateVendor(token, editing.id, {
        grab_merchant_id: grabForm.grab_merchant_id.trim() || null,
        grab_markup_percent: grabForm.grab_markup_percent,
      });
      setEditing(updated);
      setGrabForm({
        grab_merchant_id: updated.grab_merchant_id || "",
        grab_markup_percent: Number(updated.grab_markup_percent ?? 30),
      });
      setSaved("Grab Food settings saved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Grab setup");
    } finally {
      setBusyId(null);
    }
  }

  async function connectVendorGrab() {
    if (!token || !editing) return;
    setError("");
    setSaved("");
    setBusyId(editing.id);
    try {
      const updated = await api.connectVendorGrab(token, editing.id);
      setEditing(updated);
      setGrabForm({
        grab_merchant_id: updated.grab_merchant_id || "",
        grab_markup_percent: Number(updated.grab_markup_percent ?? 30),
      });
      setSaved(
        updated.grab_activation_url
          ? "Grab activation started — open the activation link"
          : "Grab activation started",
      );
      if (updated.grab_activation_url) {
        window.open(updated.grab_activation_url, "_blank", "noopener,noreferrer");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Grab");
    } finally {
      setBusyId(null);
    }
  }

  async function publishBookingFlow() {
    if (!token || !editing) return;
    setError("");
    setSaved("");
    setBusyId(editing.id);
    try {
      const updated = await api.publishVendorFlow(token, editing.id);
      setEditing(updated);
      setWaForm((f) => ({ ...f, wa_flow_id: updated.wa_flow_id || "" }));
      setSaved(`Booking Flow published · id ${updated.wa_flow_id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish Flow");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(vendor: any) {
    if (!token) return;
    await api.updateVendor(token, vendor.id, { is_active: !vendor.is_active });
    await refresh();
  }

  async function onViewAs(vendor: any) {
    setError("");
    setBusyId(vendor.id);
    try {
      await viewAsVendor(vendor.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not view as vendor");
    } finally {
      setBusyId(null);
    }
  }

  const effectiveVerify =
    (editing?.wa_verify_token || waForm.wa_verify_token || meta?.platform_verify_token || "").trim() ||
    "baseapp-wa-verify";

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>Master Meta / WhatsApp</h1>
            <p>
              Platform webhook defaults, then per-vendor phone IDs and tokens. Merchants can also
              self-serve the same fields under Settings.
            </p>
          </div>
        </div>

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

      <div className="grid split-2">
        <section className="panel">
          <h2>Vendors</h2>
          <p className="muted">
            Configure Meta WhatsApp / Grab Food per shop, or open View as → Settings.
          </p>
          {error && !editing ? <div className="error">{error}</div> : null}
          {saved && !editing ? <div className="pos-receipt ok">{saved}</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>WhatsApp</th>
                <th>Grab</th>
                <th>Usage</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.name}</strong>
                    <div className="muted">
                      {v.slug} · {v.industry} · {v.country}
                    </div>
                    <div className="muted">{v.owner_email || "—"}</div>
                  </td>
                  <td>
                    <span className={`badge ${v.wa_phone_number_id ? "" : "warn"}`}>
                      {v.wa_webhook_status || "not_configured"}
                    </span>
                    <div className="muted">
                      {v.wa_display_phone || v.wa_phone_number_id || "Not linked"}
                    </div>
                    <div className="muted">
                      Token {v.wa_access_token_set ? "saved" : "missing"}
                    </div>
                  </td>
                  <td>
                    {isFnbIndustry(v.industry) ? (
                      <>
                        <span
                          className={`order-channel-pill channel-grab ${
                            v.grab_merchant_id || v.grab_sync_status !== "not_configured"
                              ? ""
                              : ""
                          }`}
                        >
                          Grab
                        </span>
                        <div className="muted" style={{ marginTop: "0.25rem" }}>
                          {v.grab_sync_status || "not_configured"}
                        </div>
                        <div className="muted">{v.grab_merchant_id || "No merchant ID"}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {v.services_count} services
                    <div className="muted">{v.bookings_count} bookings</div>
                  </td>
                  <td>
                    <span className={`badge ${v.is_active ? "" : "warn"}`}>
                      {v.is_active ? "active" : "disabled"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    <button className="btn secondary" onClick={() => openMetaSetup(v)}>
                      Meta setup
                    </button>
                    {isFnbIndustry(v.industry) ? (
                      <button className="btn secondary" onClick={() => openGrabSetup(v)}>
                        Grab setup
                      </button>
                    ) : null}
                    <button
                      className="btn"
                      disabled={!v.is_active || busyId === v.id}
                      onClick={() => onViewAs(v)}
                    >
                      {busyId === v.id ? "Opening…" : "View as"}
                    </button>
                    <button className="btn secondary" onClick={() => toggleActive(v)}>
                      {v.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="grid" style={{ gap: "1rem", alignContent: "start" }}>
          {editing && editPanel === "grab" ? (
            <form className="panel form order-card channel-grab" onSubmit={saveGrabSetup}>
              <div className="bookings-toolbar">
                <div>
                  <div className="order-card-title">
                    <span className="order-channel-pill channel-grab">Grab</span>
                    <h2 style={{ margin: 0 }}>Grab Food — {editing.name}</h2>
                  </div>
                  <p className="muted">
                    Status: {editing.grab_sync_status || "not_configured"}
                    {editing.grab_merchant_id ? ` · ${editing.grab_merchant_id}` : ""}
                    {" · partner "}
                    {editing.slug}
                  </p>
                </div>
                <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
                  Close
                </button>
              </div>
              <label>
                Grab merchant ID
                <input
                  value={grabForm.grab_merchant_id}
                  onChange={(e) =>
                    setGrabForm((f) => ({ ...f, grab_merchant_id: e.target.value }))
                  }
                  placeholder="From Grab after Enable Integration"
                />
              </label>
              <label>
                Default Grab markup (%)
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={grabForm.grab_markup_percent}
                  onChange={(e) =>
                    setGrabForm((f) => ({
                      ...f,
                      grab_markup_percent: Number(e.target.value),
                    }))
                  }
                />
              </label>
              {editing.grab_activation_url ? (
                <>
                  <div className="pos-receipt-row">
                    <span className="muted">Activation URL</span>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => copyText(editing.grab_activation_url)}
                    >
                      Copy
                    </button>
                  </div>
                  <code className="settings-code">{editing.grab_activation_url}</code>
                </>
              ) : null}
              {error ? <div className="error">{error}</div> : null}
              {saved ? <div className="pos-receipt ok">{saved}</div> : null}
              <div className="pos-receipt-row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <button className="btn" disabled={busyId === editing.id}>
                  {busyId === editing.id ? "Saving…" : "Save Grab setup"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busyId === editing.id}
                  onClick={connectVendorGrab}
                >
                  Connect Grab
                </button>
                <button type="button" className="btn secondary" onClick={() => setEditPanel("meta")}>
                  Meta setup
                </button>
              </div>
            </form>
          ) : null}

          {editing && editPanel === "meta" ? (
            <form className="panel form" onSubmit={saveMetaSetup}>
              <div className="bookings-toolbar">
                <div>
                  <h2>Meta / WhatsApp — {editing.name}</h2>
                  <p className="muted">
                    Status: {editing.wa_webhook_status || "not_configured"}
                    {editing.wa_access_token_set ? " · token on file" : " · no shop token"}
                  </p>
                </div>
                <button type="button" className="btn secondary" onClick={() => setEditing(null)}>
                  Close
                </button>
              </div>
              <label>
                Display phone
                <input
                  value={waForm.wa_display_phone}
                  onChange={(e) => setWaForm((f) => ({ ...f, wa_display_phone: e.target.value }))}
                  placeholder="+60 12-345 6789"
                />
              </label>
              <label>
                Phone number ID
                <input
                  value={waForm.wa_phone_number_id}
                  onChange={(e) => setWaForm((f) => ({ ...f, wa_phone_number_id: e.target.value }))}
                  placeholder="From Meta → WhatsApp → API Setup"
                />
              </label>
              <label>
                WhatsApp Business Account ID
                <input
                  value={waForm.wa_business_account_id}
                  onChange={(e) =>
                    setWaForm((f) => ({ ...f, wa_business_account_id: e.target.value }))
                  }
                  placeholder="Required to publish in-chat booking Flow"
                />
              </label>
              <label>
                Booking Flow ID
                <input
                  value={waForm.wa_flow_id}
                  onChange={(e) => setWaForm((f) => ({ ...f, wa_flow_id: e.target.value }))}
                  placeholder="Auto-filled by Publish, or paste from Meta"
                />
              </label>
              <label>
                Permanent access token
                <input
                  type="password"
                  value={waForm.wa_access_token}
                  onChange={(e) => setWaForm((f) => ({ ...f, wa_access_token: e.target.value }))}
                  placeholder={
                    editing.wa_access_token_set
                      ? "Leave blank to keep current token"
                      : "System user token"
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={waForm.clear_wa_access_token}
                  onChange={(e) =>
                    setWaForm((f) => ({ ...f, clear_wa_access_token: e.target.checked }))
                  }
                />
                Clear saved access token
              </label>
              <label>
                Webhook verify token (optional override)
                <input
                  value={waForm.wa_verify_token}
                  onChange={(e) => setWaForm((f) => ({ ...f, wa_verify_token: e.target.value }))}
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
              <div className="pos-receipt-row" style={{ marginTop: "0.55rem" }}>
                <span className="muted">Flows endpoint</span>
                <button type="button" className="btn secondary" onClick={() => copyText(FLOWS_URL)}>
                  Copy
                </button>
              </div>
              <code className="settings-code">{FLOWS_URL}</code>
              <div className="pos-receipt-row" style={{ marginTop: "0.55rem" }}>
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
              {saved ? <div className="pos-receipt ok">{saved}</div> : null}
              <div className="pos-receipt-row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <button className="btn" disabled={busyId === editing.id}>
                  {busyId === editing.id ? "Saving…" : "Save Meta setup"}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busyId === editing.id || !waForm.wa_business_account_id.trim()}
                  onClick={publishBookingFlow}
                >
                  Publish booking Flow
                </button>
                {isFnbIndustry(editing.industry) ? (
                  <button type="button" className="btn secondary" onClick={() => setEditPanel("grab")}>
                    Grab setup
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <form className="panel form" onSubmit={onCreate}>
            <h2>Create vendor</h2>
            <label>
              Shop / vendor name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Industry
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="health_beauty">Health & Beauty</option>
                <option value="fnb">Food & Beverage</option>
                <option value="retail">Retail</option>
                <option value="general">General</option>
              </select>
            </label>
            <label>
              Country
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="MY">Malaysia</option>
                <option value="TH">Thailand</option>
                <option value="SG">Singapore</option>
                <option value="ID">Indonesia</option>
              </select>
            </label>
            <label>
              Owner full name
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
            </label>
            <label>
              Owner login email
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Owner temporary password
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              WhatsApp phone number ID (optional)
              <input
                value={createWaPhoneId}
                onChange={(e) => setCreateWaPhoneId(e.target.value)}
                placeholder="Can configure later via Meta setup"
              />
            </label>
            {error && !editing ? <div className="error">{error}</div> : null}
            <button className="btn">Create vendor + owner login</button>
          </form>
        </div>
      </div>
    </div>
  );
}
