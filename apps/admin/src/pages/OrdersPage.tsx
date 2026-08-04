import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

const STATUS_ACTIONS: Record<string, { label: string; next: string; className?: string }[]> = {
  new: [
    { label: "Accept", next: "accepted" },
    { label: "Reject", next: "rejected", className: "secondary" },
  ],
  accepted: [
    { label: "Preparing", next: "preparing" },
    { label: "Ready", next: "ready" },
  ],
  preparing: [{ label: "Mark ready", next: "ready" }],
  ready: [{ label: "Complete", next: "completed" }],
};

function money(currency: string, amount: number) {
  return `${currency || "MYR"} ${Number(amount || 0).toFixed(2)}`;
}

export default function OrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("open");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!token) return;
    const rows = await api.orders(token, { channel: "grab" });
    setOrders(rows);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    const t = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(t);
  }, [token]);

  const visible = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "open") {
      return !["completed", "cancelled", "rejected"].includes(o.status);
    }
    return o.status === filter;
  });

  async function setStatus(id: number, status: string) {
    if (!token) return;
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      await api.updateOrder(token, id, { status });
      await refresh();
      setMessage(`Order #${id} → ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update order");
    } finally {
      setBusyId(null);
    }
  }

  async function simulate() {
    if (!token) return;
    setError("");
    setMessage("");
    try {
      const order = await api.simulateGrabOrder(token, {
        customer_name: "Walk-up Grab test",
        notes: "Simulated from Orders panel",
      });
      await refresh();
      setMessage(`Simulated Grab order ${order.short_order_number || order.external_order_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulate failed");
    }
  }

  return (
    <div className="page-scroll">
      <section className="panel">
        <div className="bookings-toolbar">
          <div>
            <h1>Orders</h1>
            <p>Grab Food tickets — accept, prepare, and mark ready for pickup.</p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn secondary" onClick={() => refresh()}>
              Refresh
            </button>
            <button type="button" className="btn" onClick={simulate}>
              Simulate Grab order
            </button>
          </div>
        </div>

        <div className="btn-row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
          {[
            ["open", "Open"],
            ["new", "New"],
            ["accepted", "Accepted"],
            ["ready", "Ready"],
            ["all", "All"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn ${filter === value ? "" : "secondary"}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="error">{error}</div> : null}
        {message ? <p className="muted">{message}</p> : null}

        {visible.length === 0 ? (
          <p className="muted">No Grab orders yet. Publish your menu, then wait for Grab — or simulate one.</p>
        ) : (
          <div className="grid" style={{ gap: "0.85rem" }}>
            {visible.map((order) => (
              <article key={order.id} className="panel" style={{ margin: 0, boxShadow: "none" }}>
                <div className="bookings-toolbar" style={{ marginBottom: "0.5rem" }}>
                  <div>
                    <strong>
                      {order.short_order_number || `#${order.id}`} · {order.status}
                    </strong>
                    <div className="muted">
                      {order.customer_name || "Customer"}
                      {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                      {" · "}
                      {order.channel?.toUpperCase()}
                      {order.external_order_id ? ` · ${order.external_order_id}` : ""}
                    </div>
                  </div>
                  <strong>{money(order.currency, order.total_amount)}</strong>
                </div>
                <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.1rem" }}>
                  {(order.lines || []).map((line: any) => (
                    <li key={line.id}>
                      {line.quantity}× {line.name} — {money(order.currency, line.line_total)}
                    </li>
                  ))}
                </ul>
                {order.notes ? <p className="muted">{order.notes}</p> : null}
                <div className="btn-row">
                  {(STATUS_ACTIONS[order.status] || []).map((action) => (
                    <button
                      key={action.next}
                      type="button"
                      className={`btn ${action.className || ""}`}
                      disabled={busyId === order.id}
                      onClick={() => setStatus(order.id, action.next)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
