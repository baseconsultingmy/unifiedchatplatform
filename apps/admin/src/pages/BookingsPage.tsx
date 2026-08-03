import { useEffect, useMemo, useState, type FormEvent } from "react";
import QrPayPanel from "../components/QrPayPanel";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

type ViewMode = "calendar" | "list";

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
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

function formatDayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function amountDue(b: any) {
  const deposit = Number(b.deposit_amount || 0);
  return deposit > 0 ? deposit : Number(b.amount || 0);
}

function isPaid(status: string) {
  return status === "paid" || status === "deposit_paid";
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08–21

export default function BookingsPage() {
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const [view, setView] = useState<ViewMode>("calendar");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [bookings, setBookings] = useState<any[]>([]);
  const [listBookings, setListBookings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [filterPersonId, setFilterPersonId] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [showQr, setShowQr] = useState(false);

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

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)),
    [weekAnchor],
  );

  async function refresh() {
    if (!token) return;
    const from = weekAnchor.toISOString();
    const to = addDays(weekAnchor, 7).toISOString();
    const [week, all, c, s, r] = await Promise.all([
      api.bookings(token, { from, to }),
      api.bookings(token),
      api.customers(token),
      api.services(token),
      profile.supportsResources ? api.resources(token) : Promise.resolve([]),
    ]);
    setBookings(week);
    setListBookings(all);
    setCustomers(c);
    setServices(s);
    setResources(r);
    if (!serviceId && s[0]) setServiceId(String(s[0].id));
    if (selected) {
      const fresh = all.find((b: any) => b.id === selected.id) || week.find((b: any) => b.id === selected.id);
      setSelected(fresh || null);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token, weekAnchor]);

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

  function bookingsForDay(day: Date) {
    return bookings.filter((b) => {
      if (!b.starts_at || !sameDay(new Date(b.starts_at), day)) return false;
      if (filterPersonId && String(b.person_id || "") !== filterPersonId) return false;
      return true;
    });
  }

  function assignmentLabel(b: any) {
    const bits = [b.person?.name, b.room?.name].filter(Boolean);
    return bits.join(" · ");
  }

  function blockStyle(b: any) {
    const start = new Date(b.starts_at);
    const duration =
      b.ends_at && b.starts_at
        ? Math.max(30, (new Date(b.ends_at).getTime() - start.getTime()) / 60000)
        : b.service?.duration_minutes || 60;
    const top = ((start.getHours() + start.getMinutes() / 60 - 8) / 14) * 100;
    const height = Math.max((duration / 60 / 14) * 100, 4);
    return { top: `${Math.max(top, 0)}%`, height: `${Math.min(height, 100 - Math.max(top, 0))}%` };
  }

  const weekLabel = `${formatDayLabel(weekDays[0])} – ${formatDayLabel(weekDays[6])}`;

  return (
    <div className="grid">
      <div className="bookings-toolbar">
        <div>
          <h1>Bookings</h1>
          <p>Calendar and list for WhatsApp + walk-in reservations.</p>
        </div>
        <div className="toolbar-actions">
          <div className="segmented">
            <button
              type="button"
              className={view === "calendar" ? "active" : ""}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {view === "calendar" ? (
        <section className="panel calendar-panel">
          <div className="calendar-nav">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
            >
              Prev
            </button>
            <div>
              <strong>{weekLabel}</strong>
              <div className="muted">Week view · 08:00–22:00</div>
            </div>
            <div className="btn-row">
              {profile.supportsResources && people.length ? (
                <select
                  value={filterPersonId}
                  onChange={(e) => setFilterPersonId(e.target.value)}
                  aria-label={`Filter by ${profile.personNoun}`}
                >
                  <option value="">All {profile.personNoun.toLowerCase()}s</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="btn secondary"
                onClick={() => setWeekAnchor(startOfWeek(new Date()))}
              >
                Today
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
              >
                Next
              </button>
            </div>
          </div>

          <div className="calendar-grid">
            <div className="calendar-hours">
              <div className="calendar-corner" />
              {HOURS.map((h) => (
                <div key={h} className="calendar-hour">
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekDays.map((day) => {
              const dayBookings = bookingsForDay(day);
              const isToday = sameDay(day, new Date());
              return (
                <div key={day.toISOString()} className={`calendar-day ${isToday ? "today" : ""}`}>
                  <div className="calendar-day-head">{formatDayLabel(day)}</div>
                  <div className="calendar-day-body">
                    {HOURS.map((h) => (
                      <div key={h} className="calendar-slot" />
                    ))}
                    {dayBookings.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`calendar-event pay-${b.payment_status}`}
                        style={blockStyle(b)}
                        onClick={() => {
                          setSelected(b);
                          setShowQr(false);
                        }}
                        title={`${b.service?.name || "Booking"} · ${b.customer?.name || b.customer?.phone}${assignmentLabel(b) ? ` · ${assignmentLabel(b)}` : ""}`}
                      >
                        <strong>{b.service?.name || "Booking"}</strong>
                        <span>{b.customer?.name || b.customer?.phone}</span>
                        {assignmentLabel(b) ? <span className="calendar-assign">{assignmentLabel(b)}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="panel">
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
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setSelected(b);
                        setShowQr(false);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid split-2">
        <section className="panel">
          {selected ? (
            <>
              <div className="bookings-toolbar">
                <div>
                  <h2>Booking #{selected.id}</h2>
                  <p>
                    {selected.service?.name || "Service"} ·{" "}
                    {selected.customer?.name || selected.customer?.phone}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    setSelected(null);
                    setShowQr(false);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="detail-grid">
                <div>
                  <span className="muted">When</span>
                  <div>
                    {selected.starts_at
                      ? new Date(selected.starts_at).toLocaleString()
                      : "TBD"}
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
                      {selected.paid_at
                        ? ` · ${new Date(selected.paid_at).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                </div>
                {profile.supportsResources ? (
                  <>
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
                  </>
                ) : null}
              </div>

              <div className="btn-row" style={{ marginTop: "1rem" }}>
                {!isPaid(selected.payment_status) ? (
                  <>
                    <button
                      className="btn"
                      onClick={() =>
                        patchSelected({ payment_status: "paid", status: "confirmed" })
                      }
                    >
                      Mark paid
                    </button>
                    {selected.payment_url ? (
                      <button className="btn secondary" onClick={() => setShowQr(true)}>
                        Show QR pay
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
                <div style={{ marginTop: "1rem" }}>
                  <QrPayPanel
                    paymentUrl={selected.payment_url}
                    amountLabel={`${selected.currency} ${amountDue(selected).toFixed(2)}`}
                    subtitle={`Booking #${selected.id}`}
                    onPaid={() => refresh()}
                    onClose={() => setShowQr(false)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h2>Select a booking</h2>
              <p>Click a calendar block or open a list row to manage status and payments.</p>
            </>
          )}
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
          {profile.supportsResources ? (
            <>
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
            </>
          ) : null}
          <label>
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <button className="btn">Create booking</button>
        </form>
      </div>
    </div>
  );
}
