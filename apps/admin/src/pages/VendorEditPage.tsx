import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  COUNTRY_OPTIONS,
  currencyForCountry,
  timezoneForCountry,
} from "../currency";
import { INDUSTRY_OPTIONS, industryProfile } from "../industry";

export default function VendorEditPage() {
  const { id } = useParams();
  const vendorId = Number(id);
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  const [vendor, setVendor] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("general");
  const [country, setCountry] = useState("MY");
  const [timezone, setTimezone] = useState(timezoneForCountry("MY"));
  const [tzManual, setTzManual] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const currency = currencyForCountry(country);

  useEffect(() => {
    if (!isPlatformAdmin || !token || !vendorId) return;
    setLoading(true);
    api
      .vendors(token)
      .then((list) => {
        const v = list.find((x: any) => x.id === vendorId);
        if (!v) {
          setError("Vendor not found");
          setVendor(null);
          return;
        }
        setVendor(v);
        setName(v.name || "");
        setIndustry(v.industry || "general");
        setCountry((v.country || "MY").toUpperCase());
        setTimezone(v.timezone || timezoneForCountry(v.country));
        setTzManual(false);
        setIsActive(Boolean(v.is_active));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load vendor"))
      .finally(() => setLoading(false));
  }, [token, isPlatformAdmin, vendorId]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (!vendorId) return <Navigate to="/vendors" replace />;

  function onCountryChange(next: string) {
    setCountry(next);
    if (!tzManual) setTimezone(timezoneForCountry(next));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !vendor) return;
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const updated = await api.updateVendor(token, vendor.id, {
        name: name.trim(),
        industry,
        country,
        timezone,
        is_active: isActive,
      });
      setVendor(updated);
      setName(updated.name || name);
      setIndustry(updated.industry || industry);
      setCountry((updated.country || country).toUpperCase());
      setTimezone(updated.timezone || timezone);
      setIsActive(Boolean(updated.is_active));
      const ccy = updated.currency || currencyForCountry(updated.country);
      setSaved(
        `Saved · ${industryProfile(updated.industry).label} · ${updated.country} / ${ccy}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save vendor");
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
              <Link to="/vendors">Vendors</Link> / Edit
            </p>
            <h1>Edit vendor{vendor ? ` — ${vendor.name}` : ""}</h1>
            <p>Shop name, business category, country, and currency.</p>
          </div>
          <div className="vendor-toolbar-actions">
            {vendor ? (
              <>
                <Link to={`/vendors/${vendor.id}/meta`} className="btn secondary">
                  Meta
                </Link>
                {industry === "fnb" || vendor.industry === "fnb" ? (
                  <Link to={`/vendors/${vendor.id}/grab`} className="btn secondary">
                    Grab
                  </Link>
                ) : null}
              </>
            ) : null}
            <Link to="/vendors" className="btn secondary">
              Back
            </Link>
          </div>
        </div>

        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <div className="error">{error}</div> : null}
        {saved ? <div className="pos-receipt ok">{saved}</div> : null}

        {vendor ? (
          <form className="form" onSubmit={onSave} style={{ display: "grid", gap: "0.75rem" }}>
            <label>
              Shop / vendor name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                required
              />
            </label>

            <label>
              Slug
              <input value={vendor.slug || ""} disabled readOnly />
              <span className="muted" style={{ display: "block", marginTop: "0.35rem" }}>
                Booking URL path — fixed after create.
              </span>
            </label>

            <label>
              Category / industry
              <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ display: "block", marginTop: "0.35rem" }}>
                Controls nav (bookings vs orders), POS labels, and Grab availability.
              </span>
            </label>

            <label>
              Country
              <select value={country} onChange={(e) => onCountryChange(e.target.value)}>
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Currency
              <input value={currency} disabled readOnly />
              <span className="muted" style={{ display: "block", marginTop: "0.35rem" }}>
                Set by country. Changing country updates menu prices to {currency} and timezone
                unless you override timezone below.
              </span>
            </label>

            <label>
              Timezone
              <select
                value={timezone}
                onChange={(e) => {
                  setTzManual(true);
                  setTimezone(e.target.value);
                }}
              >
                <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur</option>
                <option value="Asia/Bangkok">Asia/Bangkok</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="Asia/Jakarta">Asia/Jakarta</option>
              </select>
            </label>

            <label className="checkbox-row" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active (shop can sign in)
            </label>

            {vendor.owner_email ? (
              <p className="muted" style={{ margin: 0 }}>
                Owner login: {vendor.owner_email}
              </p>
            ) : null}

            <div className="vendor-toolbar-actions">
              <button type="submit" className="btn" disabled={busy || !name.trim()}>
                {busy ? "Saving…" : "Save vendor"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => navigate("/vendors")}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
