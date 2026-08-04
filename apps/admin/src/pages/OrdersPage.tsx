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

const CHANNEL_LABELS: Record<string, string> = {
  grab: "Grab",
  foodpanda: "foodpanda",
};

function money(currency: string, amount: number) {
  return `${currency || "MYR"} ${Number(amount || 0).toFixed(2)}`;
}

function channelKey(raw?: string | null) {
  return (raw || "grab").toLowerCase();
}

function channelLabel(raw?: string | null) {
  const key = channelKey(raw);
  return CHANNEL_LABELS[key] || key;
}

export default function OrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("open");
  const [channelFilter, setChannelFilter] = useState("all");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!token) return;
    // All marketplace channels (Grab today; foodpanda when integrated).
    const rows = await api.orders(token);
    setOrders(rows);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    const t = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(t);
  }, [token]);

  const channelsPresent = Array.from(
    new Set(orders.map((o) => channelKey(o.channel)).filter(Boolean)),
  );

  const visible = orders.filter((o) => {
    const ch = channelKey(o.channel);
    if (channelFilter !== "all" && ch !== channelFilter) return false;
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
            <p>Marketplace tickets — Grab now; foodpanda colors ready when connected.</p>
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

        <div className="orders-channel-legend" aria-label="Channel colors">
          <span className="order-channel-pill channel-grab">Grab</span>
          <span className="order-channel-pill channel-foodpanda">foodpanda</span>
          <span className="muted" style={{ fontSize: "0.8rem", alignSelf: "center" }}>
            Channel colors on each ticket
          </span>
        </div>

        <div className="btn-row" style={{ marginBottom: "0.65rem", flexWrap: "wrap" }}>
          {[
            ["all", "All channels"],
            ["grab", "Grab"],
            ...(channelsPresent.includes("foodpanda") || channelFilter === "foodpanda"
              ? [["foodpanda", "foodpanda"] as const]
              : []),
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn ${channelFilter === value ? "" : "secondary"}`}
              onClick={() => setChannelFilter(value)}
            >
              {label}
            </button>
          ))}
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
          <p className="muted">
            No marketplace orders yet. Publish your menu, then wait for Grab — or simulate one.
          </p>
        ) : (
          <div className="orders-queue">
            {visible.map((order) => {
              const ch = channelKey(order.channel);
              return (
                <article key={order.id} className={`order-card channel-${ch}`}>
                  <div className="order-card-head">
                    <div>
                      <div className="order-card-title">
                        <span className={`order-channel-pill channel-${ch}`}>
                          {channelLabel(ch)}
                        </span>
                        <strong>{order.short_order_number || `#${order.id}`}</strong>
                        <span className="order-status-pill">{order.status}</span>
                      </div>
                      <div className="muted">
                        {order.customer_name || "Customer"}
                        {order.customer_phone ? ` · ${order.customer_phone}` : ""}
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
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
