import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export default function ConversationsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const selectedPreview = useMemo(
    () => items.find((c) => c.id === selectedId) || null,
    [items, selectedId],
  );

  async function loadList(preferId?: number | null) {
    if (!token) return;
    const data = await api.conversations(token);
    setItems(data);
    const nextId = preferId ?? selectedId ?? data[0]?.id ?? null;
    setSelectedId(nextId);
    if (nextId) {
      const detail = data.find((c) => c.id === nextId) || (await api.conversation(token, nextId));
      setSelected(detail);
    } else {
      setSelected(null);
    }
  }

  async function loadThread(id: number) {
    if (!token) return;
    const detail = await api.conversation(token, id);
    setSelected(detail);
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...detail } : c)));
  }

  useEffect(() => {
    if (!token) return;
    loadList().catch((err) => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) return;
    const timer = window.setInterval(() => {
      loadThread(selectedId).catch(() => undefined);
      api.conversations(token).then(setItems).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [token, selectedId]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [selected?.messages?.length, selectedId]);

  async function onSelect(id: number) {
    setSelectedId(id);
    setError("");
    try {
      await loadThread(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load thread");
    }
  }

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    if (!token || !selectedId || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await api.sendMessage(token, selectedId, draft.trim());
      setDraft("");
      await loadThread(selectedId);
      await loadList(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="grid page-fill inbox-page">
      <div className="bookings-toolbar page-head">
        <div>
          <h1>Inbox</h1>
          <p>Live WhatsApp chat. Reply within the 24-hour customer care window.</p>
        </div>
        <button className="btn secondary" onClick={() => loadList(selectedId).catch((e) => setError(e.message))}>
          Refresh
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="grid split-2 chat-layout page-panel">
        <section className="panel table-panel">
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
                    No conversations yet. When a customer messages your WhatsApp number, it appears here.
                  </td>
                </tr>
              ) : (
                items.map((c) => {
                  const last = (c.messages || [])[c.messages.length - 1];
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelect(c.id)}
                      style={{
                        cursor: "pointer",
                        background: selectedId === c.id ? "rgba(15,118,110,0.06)" : undefined,
                      }}
                    >
                      <td>
                        <strong>{c.customer?.name || c.external_thread_id}</strong>
                        <div className="muted">{c.customer?.phone || c.external_thread_id}</div>
                      </td>
                      <td>
                        <span className="badge">{c.channel}</span>
                      </td>
                      <td>
                        <div className="muted" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {last?.body || "—"}
                        </div>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section className="panel chat-thread page-panel">
          <div className="chat-thread-head">
            <div>
              <h2 style={{ margin: 0 }}>
                {selected?.customer?.name || selectedPreview?.customer?.name || "Thread"}
              </h2>
              <p className="muted">
                {selected?.customer?.phone || selected?.external_thread_id || "Select a conversation"}
              </p>
            </div>
          </div>

          {!selected ? (
            <p className="muted">Select a conversation</p>
          ) : (
            <>
              <div className="chat-messages" ref={threadRef}>
                {(selected.messages || []).map((m: any) => (
                  <div
                    key={m.id}
                    className={`chat-bubble ${m.direction === "inbound" ? "in" : "out"}`}
                  >
                    <div className="muted" style={{ fontSize: "0.78rem", marginBottom: 4 }}>
                      {m.direction} · {new Date(m.created_at).toLocaleString()}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                  </div>
                ))}
              </div>

              <form className="chat-composer" onSubmit={onSend}>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
                  rows={3}
                />
                <button className="btn" disabled={sending || !draft.trim()}>
                  {sending ? "Sending…" : "Send on WhatsApp"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
