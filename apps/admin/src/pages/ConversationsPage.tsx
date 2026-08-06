import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

function initials(name: string | undefined | null, fallback = "?") {
  const raw = (name || fallback).trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback.slice(0, 1).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() || "")
    .join("");
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayLabel(value: string) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function clock(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function lastMessage(c: any) {
  const messages = c.messages || [];
  return messages[messages.length - 1] || null;
}

function displayName(c: any) {
  return c?.customer?.name || c?.external_thread_id || "Customer";
}

function displayPhone(c: any) {
  return c?.customer?.phone || c?.external_thread_id || "";
}

type ChatChannel = "whatsapp" | "line" | "messenger" | "web" | "manual";

function normalizeChannel(raw: unknown): ChatChannel {
  const value = String(raw || "whatsapp").toLowerCase();
  if (value === "line") return "line";
  if (value === "messenger" || value === "facebook" || value === "fb") return "messenger";
  if (value === "web") return "web";
  if (value === "manual") return "manual";
  return "whatsapp";
}

function channelLabel(channel: ChatChannel) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "line") return "LINE";
  if (channel === "messenger") return "Messenger";
  if (channel === "web") return "Web";
  return "Manual";
}

function channelShort(channel: ChatChannel) {
  if (channel === "whatsapp") return "WA";
  if (channel === "line") return "LN";
  if (channel === "messenger") return "MS";
  if (channel === "web") return "WB";
  return "MN";
}

type ThreadItem =
  | { kind: "day"; id: string; label: string }
  | { kind: "msg"; id: string | number; message: any };

function buildThread(messages: any[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDay = "";
  for (const m of messages) {
    const label = dayLabel(m.created_at);
    if (label !== lastDay) {
      items.push({ kind: "day", id: `day-${label}-${m.id}`, label });
      lastDay = label;
    }
    items.push({ kind: "msg", id: m.id, message: m });
  }
  return items;
}

export default function ConversationsPage() {
  const t = useT();
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedPreview = useMemo(
    () => items.find((c) => c.id === selectedId) || null,
    [items, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const name = displayName(c).toLowerCase();
      const phone = displayPhone(c).toLowerCase();
      const last = (lastMessage(c)?.body || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || last.includes(q);
    });
  }, [items, query]);

  const threadItems = useMemo(
    () => buildThread(selected?.messages || []),
    [selected?.messages],
  );

  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of items) {
      const ch = normalizeChannel(c.channel);
      counts[ch] = (counts[ch] || 0) + 1;
    }
    return counts;
  }, [items]);

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
    }, 4000);
    return () => window.clearInterval(timer);
  }, [token, selectedId]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [selected?.messages?.length, selectedId]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  async function onSelect(id: number) {
    setSelectedId(id);
    setMobileShowThread(true);
    setError("");
    setDraft("");
    try {
      await loadThread(id);
      composerRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load thread");
    }
  }

  async function onSend(e?: FormEvent) {
    e?.preventDefault();
    if (!token || !selectedId || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    setError("");
    setDraft("");
    try {
      await api.sendMessage(token, selectedId, body);
      await loadThread(selectedId);
      await loadList(selectedId);
      composerRef.current?.focus();
    } catch (err) {
      setDraft(body);
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

  const active = selected || selectedPreview;
  const activeName = displayName(active);
  const activePhone = displayPhone(active);
  const activeChannel = normalizeChannel(active?.channel);

  return (
    <div
      className={`chat-app channel-${active ? activeChannel : "neutral"} ${mobileShowThread ? "show-thread" : "show-list"}`}
    >
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <div>
            <h1>{t("chat.title")}</h1>
            <p>
              {items.length
                ? `${items.length} ${
                    items.length === 1 ? t("chat.conversation") : t("chat.conversations")
                  }`
                : t("chat.inbox")}
            </p>
            {items.length ? (
              <div className="chat-channel-legend" aria-label="Channels">
                {(
                  [
                    ["whatsapp", "WhatsApp"],
                    ["line", "LINE"],
                    ["messenger", "Messenger"],
                  ] as const
                )
                  .filter(([key]) => channelCounts[key])
                  .map(([key, label]) => (
                    <span key={key} className={`chat-legend-pill channel-${key}`}>
                      {label} {channelCounts[key]}
                    </span>
                  ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="chat-icon-btn"
            title="Refresh"
            onClick={() => loadList(selectedId).catch((e) => setError(e.message))}
          >
            ↻
          </button>
        </div>

        <label className="chat-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chat.searchPlaceholder")}
          />
        </label>

        <div className="chat-list">
          {filtered.length === 0 ? (
            <div className="chat-empty-list">
              <strong>{query ? t("chat.noMatches") : t("chat.noChats")}</strong>
              <p>{query ? t("chat.noMatchesHint") : t("chat.noChatsHint")}</p>
            </div>
          ) : (
            filtered.map((c) => {
              const last = lastMessage(c);
              const name = displayName(c);
              const phone = displayPhone(c);
              const channel = normalizeChannel(c.channel);
              const activeRow = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chat-row channel-${channel} ${activeRow ? "active" : ""}`}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="chat-avatar" data-channel={channel}>
                    <span className="chat-avatar-initials">{initials(name, phone)}</span>
                    <span className="chat-avatar-badge" aria-hidden="true">
                      {channelShort(channel)}
                    </span>
                  </span>
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <strong>{name}</strong>
                      <time>{relativeTime(c.last_message_at || last?.created_at)}</time>
                    </span>
                    <span className="chat-row-bottom">
                      <span className="chat-row-preview">
                        {last?.direction === "outbound" ? "You: " : ""}
                        {last?.body || "No messages yet"}
                      </span>
                      <span className={`chat-channel-pill channel-${channel}`}>
                        {channelLabel(channel)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="chat-stage">
        {!active ? (
          <div className="chat-empty-stage">
            <div className="chat-empty-card">
              <div className="chat-empty-brands" aria-hidden="true">
                <span className="chat-brand-dot channel-whatsapp">WA</span>
                <span className="chat-brand-dot channel-line">LN</span>
                <span className="chat-brand-dot channel-messenger">MS</span>
              </div>
              <h2>{t("chat.pickConversation")}</h2>
              <p>{t("chat.pickConversationHint")}</p>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-stage-head">
              <button
                type="button"
                className="chat-back-btn"
                onClick={() => setMobileShowThread(false)}
                aria-label="Back to chats"
              >
                ←
              </button>
              <span className="chat-avatar" data-channel={activeChannel}>
                <span className="chat-avatar-initials">{initials(activeName, activePhone)}</span>
                <span className="chat-avatar-badge" aria-hidden="true">
                  {channelShort(activeChannel)}
                </span>
              </span>
              <div className="chat-stage-identity">
                <strong>{activeName}</strong>
                <span>
                  <span className={`chat-channel-pill channel-${activeChannel} inline`}>
                    {channelLabel(activeChannel)}
                  </span>
                  {activePhone ? ` · ${activePhone}` : ""}
                </span>
              </div>
              <div className="chat-stage-actions">
                <button
                  type="button"
                  className="chat-icon-btn"
                  title="Refresh thread"
                  onClick={() =>
                    selectedId &&
                    loadThread(selectedId).catch((e) =>
                      setError(e instanceof Error ? e.message : "Refresh failed"),
                    )
                  }
                >
                  ↻
                </button>
              </div>
            </header>

            <div className="chat-stage-body">
              {error ? <div className="chat-error">{error}</div> : null}
              <div className="chat-messages" ref={threadRef}>
                {threadItems.length === 0 ? (
                  <div className="chat-empty-thread">
                    <p>No messages in this thread yet. Say hello below.</p>
                  </div>
                ) : (
                  threadItems.map((item) =>
                    item.kind === "day" ? (
                      <div key={item.id} className="chat-day-sep">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className={`chat-bubble ${item.message.direction === "inbound" ? "in" : "out"}`}
                      >
                        <div className="chat-bubble-body">{item.message.body}</div>
                        <time className="chat-bubble-meta">{clock(item.message.created_at)}</time>
                      </div>
                    ),
                  )
                )}
              </div>
            </div>

            <form className="chat-composer" onSubmit={onSend}>
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Reply on ${channelLabel(activeChannel)}…`}
                rows={1}
                aria-label={`Reply on ${channelLabel(activeChannel)}`}
              />
              <button
                className="chat-send-btn"
                disabled={sending || !draft.trim()}
                type="submit"
                aria-label="Send"
              >
                {sending ? "…" : "Send"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
