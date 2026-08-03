import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function ConversationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    api
      .conversations(token)
      .then((data) => {
        setItems(data);
        setSelected(data[0] || null);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="grid">
      <div>
        <h1>Inbox</h1>
        <p>WhatsApp threads land here. LINE adapter comes next.</p>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="grid split-2">
        <section className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Channel</th>
                <th>Last message</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No conversations yet. Point Meta webhook to
                    https://api.baseapp.asia/v1/webhooks/whatsapp
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    style={{ cursor: "pointer", background: selected?.id === c.id ? "rgba(15,118,110,0.06)" : undefined }}
                  >
                    <td>
                      <strong>{c.customer?.name || c.external_thread_id}</strong>
                      <div className="muted">{c.customer?.phone || c.external_thread_id}</div>
                    </td>
                    <td>
                      <span className="badge">{c.channel}</span>
                    </td>
                    <td>
                      {c.last_message_at
                        ? new Date(c.last_message_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Thread</h2>
          {!selected ? (
            <p className="muted">Select a conversation</p>
          ) : (
            <div className="grid" style={{ gap: "0.8rem", marginTop: "0.8rem" }}>
              {(selected.messages || []).map((m: any) => (
                <div
                  key={m.id}
                  style={{
                    justifySelf: m.direction === "inbound" ? "start" : "end",
                    maxWidth: "90%",
                    padding: "0.7rem 0.85rem",
                    borderRadius: 14,
                    background:
                      m.direction === "inbound"
                        ? "rgba(20,32,28,0.06)"
                        : "rgba(15,118,110,0.14)",
                  }}
                >
                  <div className="muted" style={{ fontSize: "0.78rem", marginBottom: 4 }}>
                    {m.direction} · {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div>{m.body}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
