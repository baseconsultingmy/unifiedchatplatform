import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

type WaForm = {
  wa_phone_number_id: string;
  wa_access_token: string;
  clear_wa_access_token: boolean;
  wa_business_account_id: string;
  wa_display_phone: string;
  wa_verify_token: string;
};

const emptyWa: WaForm = {
  wa_phone_number_id: "",
  wa_access_token: "",
  clear_wa_access_token: false,
  wa_business_account_id: "",
  wa_display_phone: "",
  wa_verify_token: "",
};

const WEBHOOK_URL = "https://api.baseapp.asia/v1/webhooks/whatsapp";

export default function VendorsPage() {
  const { token, user, viewAsVendor } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [meta, setMeta] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [waForm, setWaForm] = useState<WaForm>(emptyWa);
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
    setWaForm({
      wa_phone_number_id: vendor.wa_phone_number_id || "",
      wa_access_token: "",
      clear_wa_access_token: false,
      wa_business_account_id: vendor.wa_business_account_id || "",
      wa_display_phone: vendor.wa_display_phone || "",
      wa_verify_token: vendor.wa_verify_token || "",
    });
    setError("");
    setSaved("");
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
        wa_display_phone: waForm.wa_display_phone.trim() || null,
        wa_verify_token: waForm.wa_verify_token.trim() || null,
        clear_wa_access_token: waForm.clear_wa_access_token,
      };
      if (waForm.wa_access_token.trim()) {
        body.wa_access_token = waForm.wa_access_token.trim();
      }
      const updated = await api.updateVendor(token, editing.id, body);
      setEditing(updated);
      setWaForm((f) => ({ ...f, wa_access_token: "", clear_wa_access_token: false }));
      setSaved("WhatsApp / Meta settings saved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Meta setup");
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
            <span className="muted">Vendors linked</span>
            <div>
              {meta?.vendors_with_phone_id ?? 0} phone · {meta?.vendors_with_token ?? 0} token ·{" "}
              {meta?.vendors_verified ?? 0} verified
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
          <p className="muted">Configure Meta WhatsApp per shop, or open View as → Settings.</p>
          {error && !editing ? <div className="error">{error}</div> : null}
          {saved && !editing ? <div className="pos-receipt ok">{saved}</div> : null}
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>WhatsApp</th>
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
          {editing ? (
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
                  placeholder="Optional WABA ID"
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
              <button className="btn" disabled={busyId === editing.id}>
                {busyId === editing.id ? "Saving…" : "Save Meta setup"}
              </button>
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
