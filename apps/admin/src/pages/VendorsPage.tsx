import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

function isFnbIndustry(raw?: string | null) {
  const v = (raw || "").toLowerCase();
  return v === "fnb" || v === "food" || v === "food_beverage";
}

function waLabel(v: any) {
  return v.wa_webhook_status || "not_configured";
}

function grabLabel(v: any) {
  if (!isFnbIndustry(v.industry)) return null;
  return v.grab_sync_status || "not_configured";
}

export default function VendorsPage() {
  const { token, user, viewAsVendor } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  async function refresh() {
    if (!token) return;
    setVendors(await api.vendors(token));
  }

  useEffect(() => {
    if (!isPlatformAdmin) return;
    refresh().catch((err) => setError(err.message));
  }, [token, isPlatformAdmin]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  async function toggleActive(vendor: any) {
    if (!token) return;
    setError("");
    try {
      await api.updateVendor(token, vendor.id, { is_active: !vendor.is_active });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update vendor");
    }
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

  return (
    <div className="grid page-scroll" style={{ gap: "1rem" }}>
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>Vendors</h1>
            <p>All shops and their connection status.</p>
          </div>
          <div className="vendor-toolbar-actions">
            <Link to="/vendors/platform" className="btn secondary">
              Platform Meta
            </Link>
            <Link to="/vendors/new" className="btn">
              Create vendor
            </Link>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="table-wrap">
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
              {vendors.map((v) => {
                const grab = grabLabel(v);
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>
                        <Link to={`/vendors/${v.id}/edit`}>{v.name}</Link>
                      </strong>
                      <div className="muted">
                        {v.slug} · {v.industry} · {v.country}
                        {v.currency ? ` · ${v.currency}` : ""}
                      </div>
                      <div className="muted">{v.owner_email || "—"}</div>
                    </td>
                    <td>
                      <span className={`badge ${v.wa_phone_number_id ? "" : "warn"}`}>
                        {waLabel(v)}
                      </span>
                      <div className="muted">
                        {v.wa_display_phone || v.wa_phone_number_id || "Not linked"}
                      </div>
                      <div className="muted">
                        Token {v.wa_access_token_set ? "saved" : "missing"}
                      </div>
                    </td>
                    <td>
                      {grab ? (
                        <>
                          <span className="order-channel-pill channel-grab">Grab</span>
                          <div className="muted" style={{ marginTop: "0.25rem" }}>
                            {grab}
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
                    <td>
                      <div className="vendor-row-actions">
                        <Link to={`/vendors/${v.id}/edit`} className="btn">
                          Edit
                        </Link>
                        <Link to={`/vendors/${v.id}/meta`} className="btn secondary">
                          Meta
                        </Link>
                        {isFnbIndustry(v.industry) ? (
                          <Link to={`/vendors/${v.id}/grab`} className="btn secondary">
                            Grab
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="btn"
                          disabled={!v.is_active || busyId === v.id}
                          onClick={() => onViewAs(v)}
                        >
                          {busyId === v.id ? "Opening…" : "View as"}
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => toggleActive(v)}
                        >
                          {v.is_active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!vendors.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No vendors yet.{" "}
                    <Link to="/vendors/new">Create the first shop</Link>.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
