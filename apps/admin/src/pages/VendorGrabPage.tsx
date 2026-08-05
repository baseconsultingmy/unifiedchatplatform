import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

function isFnbIndustry(raw?: string | null) {
  const v = (raw || "").toLowerCase();
  return v === "fnb" || v === "food" || v === "food_beverage";
}

export default function VendorGrabPage() {
  const { id } = useParams();
  const vendorId = Number(id);
  const { token, user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  const [vendor, setVendor] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    grab_merchant_id: "",
    grab_markup_percent: 30,
  });

  useEffect(() => {
    if (!isPlatformAdmin || !token || !vendorId) return;
    api
      .vendors(token)
      .then((list) => {
        const v = list.find((x: any) => x.id === vendorId);
        if (!v) {
          setError("Vendor not found");
          return;
        }
        if (!isFnbIndustry(v.industry)) {
          setError("Grab Food is only available for F&B vendors");
        }
        setVendor(v);
        setForm({
          grab_merchant_id: v.grab_merchant_id || "",
          grab_markup_percent: Number(v.grab_markup_percent ?? 30),
        });
      })
      .catch((err) => setError(err.message));
  }, [token, isPlatformAdmin, vendorId]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (!vendorId) return <Navigate to="/vendors" replace />;

  function copyText(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!token || !vendor) return;
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const updated = await api.updateVendor(token, vendor.id, {
        grab_merchant_id: form.grab_merchant_id.trim() || null,
        grab_markup_percent: form.grab_markup_percent,
      });
      setVendor(updated);
      setForm({
        grab_merchant_id: updated.grab_merchant_id || "",
        grab_markup_percent: Number(updated.grab_markup_percent ?? 30),
      });
      setSaved("Grab Food settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Grab setup");
    } finally {
      setBusy(false);
    }
  }

  async function connectVendorGrab() {
    if (!token || !vendor) return;
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const updated = await api.connectVendorGrab(token, vendor.id);
      setVendor(updated);
      setForm({
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Grab");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel order-card channel-grab" style={{ maxWidth: 720 }}>
        <div className="bookings-toolbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>
              <Link to="/vendors">Vendors</Link> / Grab
            </p>
            <div className="order-card-title">
              <span className="order-channel-pill channel-grab">Grab</span>
              <h1 style={{ margin: 0 }}>Grab Food{vendor ? ` — ${vendor.name}` : ""}</h1>
            </div>
            <p className="muted">
              Status: {vendor?.grab_sync_status || "…"}
              {vendor?.grab_merchant_id ? ` · ${vendor.grab_merchant_id}` : ""}
              {vendor ? ` · partner ${vendor.slug}` : ""}
            </p>
          </div>
          <div className="vendor-toolbar-actions">
            {vendor ? (
              <Link to={`/vendors/${vendor.id}/meta`} className="btn secondary">
                Meta setup
              </Link>
            ) : null}
            <Link to="/vendors" className="btn secondary">
              Back
            </Link>
          </div>
        </div>

        {!vendor && !error ? <p className="muted">Loading…</p> : null}

        {vendor && isFnbIndustry(vendor.industry) ? (
          <form className="form" onSubmit={onSave} style={{ display: "grid", gap: "0.75rem" }}>
            <label>
              Grab merchant ID
              <input
                value={form.grab_merchant_id}
                onChange={(e) => setForm((f) => ({ ...f, grab_merchant_id: e.target.value }))}
                placeholder="From Grab after Enable Integration"
              />
            </label>
            <label>
              Default Grab markup (%)
              <input
                type="number"
                min={0}
                max={500}
                value={form.grab_markup_percent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, grab_markup_percent: Number(e.target.value) }))
                }
              />
            </label>
            {vendor.grab_activation_url ? (
              <>
                <div className="pos-receipt-row">
                  <span className="muted">Activation URL</span>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => copyText(vendor.grab_activation_url)}
                  >
                    Copy
                  </button>
                </div>
                <code className="settings-code">{vendor.grab_activation_url}</code>
              </>
            ) : null}

            {error ? <div className="error">{error}</div> : null}
            {saved ? <p className="muted">{saved}</p> : null}

            <div className="vendor-toolbar-actions">
              <button type="submit" className="btn" disabled={busy}>
                {busy ? "Saving…" : "Save Grab setup"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={connectVendorGrab}
              >
                Connect Grab
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
