import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function ServicesPage() {
  const { token } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(100);
  const [deposit, setDeposit] = useState(30);
  const [error, setError] = useState("");

  async function refresh() {
    if (!token) return;
    setServices(await api.services(token));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await api.createService(token, {
        name,
        duration_minutes: duration,
        price_amount: price,
        deposit_amount: deposit,
        currency: "MYR",
        is_active: true,
      });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create service");
    }
  }

  return (
    <div className="grid split-2">
      <section className="panel">
        <h1>Services</h1>
        <p>Massage, tattoo sessions, packages — priced and bookable.</p>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Duration</th>
              <th>Price</th>
              <th>Deposit</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  {!s.is_active ? <div className="muted">Inactive</div> : null}
                </td>
                <td>{s.duration_minutes}m</td>
                <td>
                  {s.currency} {s.price_amount}
                </td>
                <td>
                  {s.currency} {s.deposit_amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form className="panel form" onSubmit={onCreate}>
        <h2>Add service</h2>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Duration (minutes)
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            min={15}
          />
        </label>
        <label>
          Price (MYR)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            min={0}
          />
        </label>
        <label>
          Deposit (MYR)
          <input
            type="number"
            value={deposit}
            onChange={(e) => setDeposit(Number(e.target.value))}
            min={0}
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="btn">Save service</button>
      </form>
    </div>
  );
}
