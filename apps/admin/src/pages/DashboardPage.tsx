import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const isPlatformAdmin = user?.role === "platform_admin" && !user?.impersonating;

  useEffect(() => {
    if (!token) return;
    api
      .dashboard(token)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">Loading overview…</div>;

  if (isPlatformAdmin) {
    const cards = [
      ["Vendors", data.vendors_total],
      ["Active vendors", data.vendors_active],
      ["All bookings", data.bookings_total],
      ["Open chats", data.open_conversations],
      ["Customers", data.customers_total],
    ];
    return (
      <div className="grid page-scroll">
        <div>
          <h1>Platform overview</h1>
          <p>Master Admin controls vendors. Each vendor manages their own services and bookings.</p>
        </div>
        <div className="grid stats">
          {cards.map(([label, value]) => (
            <div className="panel stat" key={label as string}>
              <span className="muted">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="panel">
          <h2>Next</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            Create a vendor, share their owner login, and let them add services.
          </p>
          <Link className="btn" to="/vendors">
            Manage vendors
          </Link>
        </div>
      </div>
    );
  }

  const cards = [
    ["Bookings", data.bookings_total],
    ["Confirmed", data.bookings_confirmed],
    ["Today", data.bookings_today],
    ["Open chats", data.open_conversations],
    ["Services", data.services_active],
    ["Customers", data.customers_total],
  ];

  return (
    <div className="grid page-scroll">
      <div>
        <h1>Vendor overview</h1>
        <p>Your shop workspace — services, reservations, walk-in POS, and WhatsApp inbox.</p>
      </div>
      <div className="grid stats">
        {cards.map(([label, value]) => (
          <div className="panel stat" key={label as string}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="grid split-2">
        <div className="panel">
          <h2>Bookings calendar</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            See the week at a glance, update status, and collect deposits with QR.
          </p>
          <Link className="btn" to="/bookings">
            Open bookings
          </Link>
        </div>
        <div className="panel">
          <h2>Walk-in POS</h2>
          <p className="muted" style={{ marginBottom: "0.8rem" }}>
            Ring up a counter sale — cash or show a payment QR.
          </p>
          <Link className="btn" to="/pos">
            Open POS
          </Link>
        </div>
      </div>
    </div>
  );
}
