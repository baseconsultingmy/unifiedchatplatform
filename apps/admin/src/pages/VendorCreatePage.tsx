import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { COUNTRY_OPTIONS, currencyForCountry } from "../currency";
import { INDUSTRY_OPTIONS } from "../industry";

export default function VendorCreatePage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("health_beauty");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [country, setCountry] = useState("MY");
  const [waPhoneId, setWaPhoneId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shopCurrencyCode = currencyForCountry(country);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setBusy(true);
    try {
      const created = await api.createVendor(token, {
        name,
        industry,
        country,
        owner_full_name: ownerName,
        owner_email: ownerEmail,
        owner_password: ownerPassword,
        wa_phone_number_id: waPhoneId.trim() || null,
      });
      navigate(`/vendors/${created.id}/meta`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create vendor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel" style={{ maxWidth: 640 }}>
        <div className="bookings-toolbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              <Link to="/vendors">Vendors</Link> / Create
            </p>
            <h1>Create vendor</h1>
            <p>Provision a shop and owner login.</p>
          </div>
          <Link to="/vendors" className="btn secondary">
            Back
          </Link>
        </div>

        <form className="form" onSubmit={onCreate} style={{ display: "grid", gap: "0.75rem" }}>
          <label>
            Shop / vendor name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Industry
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
              {INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Country
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="muted" style={{ display: "block", marginTop: "0.35rem" }}>
              Menu, POS, and reports will use {shopCurrencyCode}.
            </span>
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
              value={waPhoneId}
              onChange={(e) => setWaPhoneId(e.target.value)}
              placeholder="Can configure later under Meta"
            />
          </label>
          {error ? <div className="error">{error}</div> : null}
          <div className="vendor-toolbar-actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Creating…" : "Create vendor + owner login"}
            </button>
            <Link to="/vendors" className="btn secondary">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}
