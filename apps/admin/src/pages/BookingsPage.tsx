import { useEffect, useMemo, useState, type FormEvent } from "react";
import QrPayPanel from "../components/QrPayPanel";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

type ViewMode = "day" | "list";
type BoardMode = "person" | "room";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22; // exclusive
const SLOT_MINUTES = 30;
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const SLOT_COUNT = TOTAL_MINUTES / SLOT_MINUTES;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayTitle(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function amountDue(b: any) {
  const deposit = Number(b.deposit_amount || 0);
  return deposit > 0 ? deposit : Number(b.amount || 0);
}

function isPaid(status: string) {
  return status === "paid" || status === "deposit_paid";
}

function bookingDurationMinutes(b: any) {
  if (b.ends_at && b.starts_at) {
    return Math.max(SLOT_MINUTES, (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000);
  }
  return Number(b.service?.duration_minutes || 60);
}

function toLocalDateTimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BookingsPage() {
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const [view, setView] = useState<ViewMode>("day");
  const [dayAnchor, setDayAnchor] = useState(() => startOfDay(new Date()));
  const [boardMode, setBoardMode] = useState<BoardMode>("person");
  const [bookings, setBookings] = useState<any[]>([]);
  const [listBookings, setListBookings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [personId, setPersonId] = useState("");
  const [startsAt, setStartsAt] = useState("");

  const rooms = useMemo(
    () => resources.filter((r) => r.kind === "room" && r.is_active),
    [resources],
  );
  const people = useMemo(
    () => resources.filter((r) => r.kind === "person" && r.is_active),
    [resources],
  );

  const dayBookings = useMemo(
    () => bookings.filter((b) => b.starts_at && sameDay(new Date(b.starts_at), dayAnchor)),
    [bookings, dayAnchor],
  );

  const columns = useMemo(() => {
    if (!profile.supportsResources) {
      return [{ id: "all", name: "Schedule", kind: "all" as const }];
    }
    const base =
      boardMode === "person"
        ? people.map((p) => ({ id: String(p.id), name: p.name, kind: "person" as const }))
        : rooms.map((r) => ({ id: String(r.id), name: r.name, kind: "room" as const }));
    return [...base, { id: "unassigned", name: "Unassigned", kind: "unassigned" as const }];
  }, [profile.supportsResources, boardMode, people, rooms]);

  const timeLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const mins = DAY_START_HOUR * 60 + i * SLOT_MINUTES;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      labels.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    return labels;
  }, []);

  async function refresh() {
    if (!token) return;
    const from = startOfDay(dayAnchor).toISOString();
    const to = addDays(startOfDay(dayAnchor), 1).toISOString();
    const [day, all, c, s, r] = await Promise.all([
      api.bookings(token, { from, to }),
      api.bookings(token),
      api.customers(token),
      api.services(token),
      profile.supportsResources ? api.resources(token) : Promise.resolve([]),
    ]);
    setBookings(day);
    setListBookings(all);
    setCustomers(c);
    setServices(s);
    setResources(r);
    if (!serviceId && s[0]) setServiceId(String(s[0].id));
    if (selected) {
      const fresh =
        all.find((b: any) => b.id === selected.id) || day.find((b: any) => b.id === selected.id);
      setSelected(fresh || null);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token, dayAnchor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setSelected(null);
      setShowQr(false);
      setShowCreate(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function openBooking(b: any) {
    setSelected(b);
    setShowQr(false);
    setShowCreate(false);
  }

  function closeBooking() {
    setSelected(null);
    setShowQr(false);
  }

  function openCreateAt(columnId: string, slotIndex: number) {
    const mins = DAY_START_HOUR * 60 + slotIndex * SLOT_MINUTES;
    const start = new Date(dayAnchor);
    start.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    setStartsAt(toLocalDateTimeValue(start));
    if (profile.supportsResources) {
      if (boardMode === "person") {
        setPersonId(columnId === "unassigned" ? "" : columnId);
        setRoomId("");
      } else {
        setRoomId(columnId === "unassigned" ? "" : columnId);
        setPersonId("");
      }
    }
    setShowCreate(true);
    setSelected(null);
    setShowQr(false);
  }

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
        room_id: roomId ? Number(roomId) : null,
        person_id: personId ? Number(personId) : null,
        channel: "manual",
        status: "confirmed",
        payment_status: service?.deposit_amount > 0 ? "deposit_due" : "unpaid",
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        amount: service?.price_amount || 0,
        deposit_amount: service?.deposit_amount || 0,
        currency: service?.currency || "MYR",
      });
      setCustomerName("");
      setCustomerPhone("");
      setStartsAt("");
      setRoomId("");
      setPersonId("");
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create booking");
    }
  }

  async function patchSelected(body: Record<string, unknown>) {
    if (!token || !selected) return;
    const updated = await api.updateBooking(token, selected.id, body);
    setSelected(updated);
    await refresh();
  }

  function assignmentLabel(b: any) {
    const bits = [b.person?.name, b.room?.name].filter(Boolean);
    return bits.join(" · ");
  }

  function bookingsForColumn(columnId: string) {
    if (columnId === "all") return dayBookings;
    if (columnId === "unassigned") {
      return dayBookings.filter((b) =>
        boardMode === "person" ? !b.person_id : !b.room_id,
      );
    }
    return dayBookings.filter((b) =>
      boardMode === "person"
        ? String(b.person_id || "") === columnId
        : String(b.room_id || "") === columnId,
    );
  }

  function blockStyle(b: any) {
    const start = new Date(b.starts_at);
    const minutesFromStart =
      start.getHours() * 60 + start.getMinutes() - DAY_START_HOUR * 60;
    const duration = bookingDurationMinutes(b);
    const top = (minutesFromStart / TOTAL_MINUTES) * 100;
    const height = (duration / TOTAL_MINUTES) * 100;
    return {
      top: `${Math.max(top, 0)}%`,
      height: `${Math.min(Math.max(height, 3.5), 100 - Math.max(top, 0))}%`,
    };
  }

  const isToday = sameDay(dayAnchor, new Date());
  const bookedCount = dayBookings.length;

  return (
    <div className={`grid page-fill ${view === "day" ? "bookings-day" : "bookings-list"}`}>
      <div className="bookings-toolbar page-head">
        <div>
          <h1>Bookings</h1>
          <p>
            {isToday ? "Today’s" : "Day"} board by{" "}
            {boardMode === "person" ? profile.personNoun.toLowerCase() : profile.roomNoun.toLowerCase()}{" "}
            — booked slots are filled.
          </p>
        </div>
        <div className="toolbar-actions">
          <div className="segmented">
            <button
              type="button"
              className={view === "day" ? "active" : ""}
              onClick={() => setView("day")}
            >
              Day
            </button>
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setStartsAt("");
              setShowCreate(true);
              setSelected(null);
              setShowQr(false);
            }}
          >
            New booking
          </button>
        </div>
      </div>

      {error && !showCreate ? <div className="error">{error}</div> : null}

      {view === "day" ? (
        <section className="panel calendar-panel page-panel">
          <div className="calendar-nav">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setDayAnchor(addDays(dayAnchor, -1))}
            >
              Prev
            </button>
            <div>
              <strong>{formatDayTitle(dayAnchor)}</strong>
              <div className="muted">
                {bookedCount} booking{bookedCount === 1 ? "" : "s"} · {DAY_START_HOUR}:00–
                {DAY_END_HOUR}:00 · {SLOT_MINUTES}-min slots
              </div>
            </div>
            <div className="btn-row">
              {profile.supportsResources ? (
                <div className="segmented">
                  <button
                    type="button"
                    className={boardMode === "person" ? "active" : ""}
                    onClick={() => setBoardMode("person")}
                  >
                    {profile.personNoun}s
                  </button>
                  <button
                    type="button"
                    className={boardMode === "room" ? "active" : ""}
                    onClick={() => setBoardMode("room")}
                  >
                    {profile.roomNoun}s
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDayAnchor(startOfDay(new Date()))}
              >
                Today
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDayAnchor(addDays(dayAnchor, 1))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="day-board-scroll">
          <div
            className="day-board"
            style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(140px, 1fr))` }}
          >
            <div className="day-board-hours">
              <div className="day-board-corner" />
              {timeLabels.map((label, idx) => (
                <div key={label} className={`day-board-hour ${idx % 2 === 0 ? "hour" : "half"}`}>
                  {idx % 2 === 0 ? label : ""}
                </div>
              ))}
            </div>

            {columns.map((col) => {
              const colBookings = bookingsForColumn(col.id);
              return (
                <div key={col.id} className={`day-board-col ${col.kind === "unassigned" ? "unassigned" : ""}`}>
                  <div className="day-board-col-head">
                    <strong>{col.name}</strong>
                    <span className="muted">
                      {colBookings.length} booked
                    </span>
                  </div>
                  <div className="day-board-col-body">
                    {timeLabels.map((label, idx) => (
                      <button
                        key={label}
                        type="button"
                        className={`day-board-slot ${idx % 2 === 0 ? "hour" : "half"}`}
                        title={`Book ${label} · ${col.name}`}
                        onClick={() => openCreateAt(col.id, idx)}
                      />
                    ))}
                    {colBookings.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`calendar-event day-board-event pay-${b.payment_status}`}
                        style={blockStyle(b)}
                        onClick={(e) => {
                          e.stopPropagation();
                          openBooking(b);
                        }}
                        title={`${b.service?.name || "Booking"} · ${b.customer?.name || b.customer?.phone}`}
                      >
                        <strong>{b.service?.name || "Booking"}</strong>
                        <span>{b.customer?.name || b.customer?.phone}</span>
                        <span className="calendar-assign">
                          {new Date(b.starts_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {" · "}
                          {bookingDurationMinutes(b)}m
                          {boardMode === "person" && b.room?.name ? ` · ${b.room.name}` : ""}
                          {boardMode === "room" && b.person?.name ? ` · ${b.person.name}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </section>
      ) : (
        <section className="panel page-panel table-panel">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                {profile.supportsResources ? <th>Assigned</th> : null}
                <th>When</th>
                <th>Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listBookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.customer?.name || b.customer?.phone}</strong>
                    <div className="muted">{b.channel}</div>
                  </td>
                  <td>{b.service?.name || "—"}</td>
                  {profile.supportsResources ? (
                    <td>{assignmentLabel(b) || <span className="muted">Unassigned</span>}</td>
                  ) : null}
                  <td>{b.starts_at ? new Date(b.starts_at).toLocaleString() : "TBD"}</td>
                  <td>
                    <span className="badge">{b.status}</span>{" "}
                    <span className={`badge ${isPaid(b.payment_status) ? "" : "warn"}`}>
                      {b.payment_status}
                    </span>
                    <div className="muted">
                      {b.currency} {amountDue(b)}
                    </div>
                  </td>
                  <td>
                    <button className="btn secondary" onClick={() => openBooking(b)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selected ? (
        <div className="modal-backdrop" onClick={closeBooking} role="presentation">
          <div
            className="modal-card booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2 id="booking-modal-title">Booking #{selected.id}</h2>
                <p>
                  {selected.service?.name || "Service"} ·{" "}
                  {selected.customer?.name || selected.customer?.phone}
                </p>
              </div>
              <button type="button" className="btn secondary" onClick={closeBooking}>
                Close
              </button>
            </div>

            {profile.supportsResources ? (
              <div className="booking-assign-row">
                <label>
                  {profile.personNoun}
                  <select
                    value={selected.person_id ? String(selected.person_id) : ""}
                    onChange={(e) =>
                      patchSelected({
                        person_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {profile.roomNoun}
                  <select
                    value={selected.room_id ? String(selected.room_id) : ""}
                    onChange={(e) =>
                      patchSelected({
                        room_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="detail-grid">
              <div>
                <span className="muted">When</span>
                <div>
                  {selected.starts_at ? new Date(selected.starts_at).toLocaleString() : "TBD"}
                </div>
              </div>
              <div>
                <span className="muted">Channel</span>
                <div>{selected.channel}</div>
              </div>
              <div>
                <span className="muted">Status</span>
                <div>
                  <span className="badge">{selected.status}</span>
                </div>
              </div>
              <div>
                <span className="muted">Payment</span>
                <div>
                  <span className={`badge ${isPaid(selected.payment_status) ? "" : "warn"}`}>
                    {selected.payment_status}
                  </span>
                  <div className="muted">
                    {selected.currency} {amountDue(selected)}
                    {selected.paid_at ? ` · ${new Date(selected.paid_at).toLocaleString()}` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: "0.85rem" }}>
              {!isPaid(selected.payment_status) ? (
                <>
                  <button
                    className="btn"
                    onClick={() => patchSelected({ payment_status: "paid", status: "confirmed" })}
                  >
                    Mark paid
                  </button>
                  {selected.payment_url ? (
                    <button className="btn secondary" onClick={() => setShowQr((v) => !v)}>
                      {showQr ? "Hide QR" : "Show QR pay"}
                    </button>
                  ) : null}
                </>
              ) : null}
              {selected.status !== "completed" ? (
                <button
                  className="btn secondary"
                  onClick={() => patchSelected({ status: "completed" })}
                >
                  Complete
                </button>
              ) : null}
              {selected.status !== "cancelled" ? (
                <button
                  className="btn secondary"
                  onClick={() => patchSelected({ status: "cancelled" })}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {showQr && selected.payment_url ? (
              <div style={{ marginTop: "0.85rem" }}>
                <QrPayPanel
                  paymentUrl={selected.payment_url}
                  amountLabel={`${selected.currency} ${amountDue(selected).toFixed(2)}`}
                  subtitle={`Booking #${selected.id}`}
                  onPaid={() => refresh()}
                  onClose={() => setShowQr(false)}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)} role="presentation">
          <form
            className="modal-card form booking-modal"
            onSubmit={onCreate}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2>New booking</h2>
                <p>Create a reservation and optionally assign room/staff.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>
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
            {profile.supportsResources ? (
              <div className="booking-assign-row">
                <label>
                  {profile.personNoun}
                  <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {profile.roomNoun}
                  <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
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
      ) : null}
    </div>
  );
}
