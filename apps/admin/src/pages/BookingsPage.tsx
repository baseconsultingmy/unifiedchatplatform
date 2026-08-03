import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function BookingsPage() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [startsAt, setStartsAt] = useState("");

  async function refresh() {
    if (!token) return;
    const [b, c, s] = await Promise.all([
      api.bookings(token),
      api.customers(token),
      api.services(token),
    ]);
    setBookings(b);
    setCustomers(c);
    setServices(s);
    if (!serviceId && s[0]) setServiceId(String(s[0].id));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      let customer = customers.find((c) => c.phone === customerPhone);
      if (!customer) {
        customer = await api.createCustomer(token, {
          name: customerName || null,
          phone: customerPhone,
        });
      }
      const service = services.find((s) => String(s.id) === serviceId);
      await api.createBooking(token, {
        customer_id: customer.id,
        service_id: service ? service.id : null,
        channel: "manual",
        status: "confirmed",
        payment_status: service?.deposit_amount > 0 ? "deposit_due" : "unpaid",
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        amount: service?.price_amount || 0,
        currency: service?.currency || "MYR",
      });
      setCustomerName("");
      setCustomerPhone("");
      setStartsAt("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create booking");
    }
  }

  async function markPaid(id: number) {
    if (!token) return;
    await api.updateBooking(token, id, { payment_status: "paid", status: "confirmed" });
    await refresh();
  }

  return (
    <div className="grid split-2">
      <section className="panel">
        <h1>Bookings</h1>
        <p>Reservations from chat and walk-ins land here.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Service</th>
              <th>When</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.customer?.name || b.customer?.phone}</strong>
                  <div className="muted">{b.channel}</div>
                </td>
                <td>{b.service?.name || "—"}</td>
                <td>{b.starts_at ? new Date(b.starts_at).toLocaleString() : "TBD"}</td>
                <td>
                  <span className="badge">{b.status}</span>{" "}
                  <span className={`badge ${b.payment_status !== "paid" ? "warn" : ""}`}>
                    {b.payment_status}
                  </span>
                </td>
                <td>
                  {b.payment_status !== "paid" ? (
                    <button className="btn secondary" onClick={() => markPaid(b.id)}>
                      Mark paid
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form className="panel form" onSubmit={onCreate}>
        <h2>New booking</h2>
        <label>
          Customer name
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </label>
        <label>
          WhatsApp / phone
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            required
            placeholder="60123456789"
          />
        </label>
        <label>
          Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.currency} {s.price_amount}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starts at
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn">Create booking</button>
      </form>
    </div>
  );
}
