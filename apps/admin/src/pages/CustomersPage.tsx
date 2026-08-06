import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

type Customer = {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at?: string | null;
};

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  notes: "",
};

export default function CustomersPage() {
  const t = useT();
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!token) return;
    setCustomers(await api.customers(token));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        String(c.name || "")
          .toLowerCase()
          .includes(q) ||
        String(c.phone || "").includes(q) ||
        String(c.email || "")
          .toLowerCase()
          .includes(q),
    );
  }, [customers, query]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setSaved("");
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      notes: c.notes || "",
    });
    setError("");
    setSaved("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const body = {
        name: form.name.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        await api.updateCustomer(token, editingId, body);
        setSaved("Customer updated");
      } else {
        await api.createCustomer(token, body);
        setSaved("Customer created");
        setForm(emptyForm);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid split-2 page-scroll">
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>{t("customers.title")}</h1>
            <p>{t("customers.subtitle")}</p>
          </div>
          <button type="button" className="btn secondary" onClick={startCreate}>
            {t("customers.newCustomer")}
          </button>
        </div>

        <label className="pos-field" style={{ marginBottom: "0.85rem" }}>
          {t("customers.search")}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("customers.searchPlaceholder")}
          />
        </label>

        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No customers yet.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name || "Unnamed"}</strong>
                    {c.notes ? <div className="muted">{c.notes}</div> : null}
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.email || "—"}</td>
                  <td>
                    <button type="button" className="btn secondary" onClick={() => startEdit(c)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <form className="panel form" onSubmit={onSubmit}>
        <div className="bookings-toolbar">
          <div>
            <h2>{editingId ? `Edit customer #${editingId}` : "New customer"}</h2>
            <p className="muted">
              {editingId ? "Update details and save." : "Add a guest to your customer book."}
            </p>
          </div>
        </div>

        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Full name"
          />
        </label>
        <label>
          WhatsApp / phone
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            required
            placeholder="60123456789"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="optional"
          />
        </label>
        <label>
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Preferences, allergies, VIP…"
            rows={4}
          />
        </label>

        {error ? <div className="error">{error}</div> : null}
        {saved ? <div className="pos-receipt ok">{saved}</div> : null}

        <div className="btn-row">
          <button className="btn" disabled={busy}>
            {busy ? "Saving…" : editingId ? "Update customer" : "Create customer"}
          </button>
          {editingId ? (
            <button type="button" className="btn secondary" onClick={startCreate}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
