import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function VendorsPage() {
  const { token, user } = useAuth();
  const [vendors, setVendors] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("wellness");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [country, setCountry] = useState("MY");

  const isPlatformAdmin = user?.role === "platform_admin";

  async function refresh() {
    if (!token) return;
    setVendors(await api.vendors(token));
  }

  useEffect(() => {
    if (!isPlatformAdmin) return;
    refresh().catch((err) => setError(err.message));
  }, [token, isPlatformAdmin]);

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      await api.createVendor(token, {
        name,
        industry,
        country,
        owner_full_name: ownerName,
        owner_email: ownerEmail,
        owner_password: ownerPassword,
      });
      setName("");
      setOwnerName("");
      setOwnerEmail("");
      setOwnerPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create vendor");
    }
  }

  async function toggleActive(vendor: any) {
    if (!token) return;
    await api.updateVendor(token, vendor.id, { is_active: !vendor.is_active });
    await refresh();
  }

  return (
    <div className="grid split-2">
      <section className="panel">
        <h1>Vendors</h1>
        <p>Each vendor is an isolated shop with its own login, services, and bookings.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Owner login</th>
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
                </td>
                <td>
                  <div>{v.owner_name || "—"}</div>
                  <div className="muted">{v.owner_email || "—"}</div>
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
                  <button className="btn secondary" onClick={() => toggleActive(v)}>
                    {v.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form className="panel form" onSubmit={onCreate}>
        <h2>Create vendor</h2>
        <label>
          Shop / vendor name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Industry
          <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="wellness">Health & wellness / massage</option>
            <option value="tattoo">Tattoo</option>
            <option value="beauty">Beauty / salon</option>
            <option value="other">Other SME</option>
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
        {error ? <div className="error">{error}</div> : null}
        <button className="btn">Create vendor + owner login</button>
      </form>
    </div>
  );
}
