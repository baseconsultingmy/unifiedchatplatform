import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function DashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api
      .dashboard(token)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">Loading overview…</div>;

  const cards = [
    ["Bookings", data.bookings_total],
    ["Confirmed", data.bookings_confirmed],
    ["Today", data.bookings_today],
    ["Open chats", data.open_conversations],
    ["Services", data.services_active],
    ["Customers", data.customers_total],
  ];

  return (
    <div className="grid">
      <div>
        <h1>Overview</h1>
        <p>One booking brain across WhatsApp, LINE (later), and walk-ins.</p>
      </div>
      <div className="grid stats">
        {cards.map(([label, value]) => (
          <div className="panel stat" key={label as string}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
