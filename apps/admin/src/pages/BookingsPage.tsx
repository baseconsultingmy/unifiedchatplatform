import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QrPayPanel from "../components/QrPayPanel";
import SaleReceipt from "../components/SaleReceipt";
import { api } from "../api";
import { useAuth } from "../auth";
import { industryProfile } from "../industry";

type ViewMode = "agenda" | "board";
type BoardMode = "person" | "room";
type BookingSheetStep = "detail" | "pay" | "cash" | "qr" | "receipt";

const DEFAULT_DAY_START_HOUR = 9;
const DEFAULT_DAY_END_HOUR = 21; // exclusive
const MIN_BOARD_START_HOUR = 6;
const MAX_BOARD_END_HOUR = 24; // exclusive, allows 23:00 slots
const SLOT_MINUTES = 30;

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

function formatDayShort(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDayLong(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function amountDue(b: any) {
  const deposit = Number(b.deposit_amount || 0);
  return deposit > 0 ? deposit : Number(b.amount || 0);
}

function isPaid(status: string) {
  return status === "paid" || status === "deposit_paid";
}

function paymentTone(status: string) {
  if (isPaid(status)) return "ok";
  if (status === "deposit_due" || status === "unpaid") return "due";
  return "muted";
}

function paymentLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "deposit_paid") return "Deposit paid";
  if (status === "deposit_due") return "Deposit due";
  if (status === "unpaid") return "Unpaid";
  return status.replace(/_/g, " ");
}

function bookingDurationMinutes(b: any) {
  if (b.ends_at && b.starts_at) {
    return Math.max(
      SLOT_MINUTES,
      (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000,
    );
  }
  return Number(b.service?.duration_minutes || 60);
}

function toLocalDateTimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() || "")
    .join("");
}

function bookingWindow(b: any, fallbackMinutes = 60): { start: Date; end: Date } | null {
  if (!b?.starts_at) return null;
  const start = new Date(b.starts_at);
  if (Number.isNaN(start.getTime())) return null;
  const end = b.ends_at
    ? new Date(b.ends_at)
    : new Date(start.getTime() + fallbackMinutes * 60000);
  if (Number.isNaN(end.getTime()) || end <= start) return null;
  return { start, end };
}

function windowsOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && a.end > b.start;
}

function isBlockingStatus(status: string | undefined) {
  return status !== "cancelled" && status !== "no_show";
}

/** Pack overlapping bookings into side-by-side lanes within a board column. */
function layoutBoardLanes(items: any[]) {
  const active = items
    .filter((b) => b.starts_at && isBlockingStatus(b.status))
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() ||
        bookingDurationMinutes(b) - bookingDurationMinutes(a),
    );

  const laneById = new Map<number, number>();
  const laneEnds: number[] = [];

  for (const booking of active) {
    const win = bookingWindow(booking, bookingDurationMinutes(booking));
    if (!win) continue;
    let lane = laneEnds.findIndex((end) => end <= win.start.getTime());
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(win.end.getTime());
    } else {
      laneEnds[lane] = win.end.getTime();
    }
    laneById.set(booking.id, lane);
  }

  const clusterSize = new Map<number, number>();
  for (const booking of active) {
    const win = bookingWindow(booking, bookingDurationMinutes(booking));
    if (!win) continue;
    let maxLane = laneById.get(booking.id) || 0;
    for (const other of active) {
      const otherWin = bookingWindow(other, bookingDurationMinutes(other));
      if (!otherWin || !windowsOverlap(win, otherWin)) continue;
      maxLane = Math.max(maxLane, laneById.get(other.id) || 0);
    }
    const size = maxLane + 1;
    for (const other of active) {
      const otherWin = bookingWindow(other, bookingDurationMinutes(other));
      if (!otherWin || !windowsOverlap(win, otherWin)) continue;
      clusterSize.set(other.id, Math.max(clusterSize.get(other.id) || 1, size));
    }
    clusterSize.set(booking.id, Math.max(clusterSize.get(booking.id) || 1, size));
  }

  const placed = active.map((booking) => ({
    booking,
    lane: laneById.get(booking.id) || 0,
    laneCount: clusterSize.get(booking.id) || 1,
  }));

  for (const booking of items) {
    if (!booking.starts_at || isBlockingStatus(booking.status)) continue;
    placed.push({ booking, lane: 0, laneCount: 1 });
  }
  return placed;
}

function minutesOnDay(value: Date, dayAnchor: Date) {
  const day0 = startOfDay(dayAnchor).getTime();
  const day1 = day0 + 24 * 60 * 60 * 1000;
  const t = value.getTime();
  if (t <= day0) return 0;
  if (t >= day1) return 24 * 60;
  return value.getHours() * 60 + value.getMinutes();
}

function computeBoardHours(dayBookings: any[], dayAnchor: Date) {
  let startHour = DEFAULT_DAY_START_HOUR;
  let endHour = DEFAULT_DAY_END_HOUR;

  for (const b of dayBookings) {
    if (!b?.starts_at) continue;
    const start = new Date(b.starts_at);
    if (Number.isNaN(start.getTime()) || !sameDay(start, dayAnchor)) continue;
    const end = b.ends_at
      ? new Date(b.ends_at)
      : new Date(start.getTime() + bookingDurationMinutes(b) * 60000);
    const startMins = minutesOnDay(start, dayAnchor);
    const endMins = Math.max(minutesOnDay(end, dayAnchor), startMins + SLOT_MINUTES);
    startHour = Math.min(startHour, Math.floor(startMins / 60));
    endHour = Math.max(endHour, Math.ceil(endMins / 60));
  }

  startHour = Math.max(MIN_BOARD_START_HOUR, Math.min(startHour, DEFAULT_DAY_START_HOUR));
  endHour = Math.min(MAX_BOARD_END_HOUR, Math.max(endHour, startHour + 1));
  // Keep slot alignment on the hour so 30-min rows stay even.
  if ((endHour - startHour) * 60 % SLOT_MINUTES !== 0) {
    endHour = Math.min(MAX_BOARD_END_HOUR, endHour + 1);
  }
  return { startHour, endHour };
}

function nowBoardPercent(anchor: Date, startHour: number, totalMinutes: number) {
  const n = new Date();
  if (!sameDay(n, anchor)) return null;
  const mins = n.getHours() * 60 + n.getMinutes() - startHour * 60;
  if (mins < 0 || mins > totalMinutes) return null;
  return (mins / totalMinutes) * 100;
}

export default function BookingsPage() {
  const { token, user } = useAuth();
  const profile = industryProfile(user?.tenant?.industry);
  const [view, setView] = useState<ViewMode>("agenda");
  const [dayAnchor, setDayAnchor] = useState(() => startOfDay(new Date()));
  const [boardMode, setBoardMode] = useState<BoardMode>("person");
  const [filterId, setFilterId] = useState<string>("all");
  const [bookings, setBookings] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [sheetStep, setSheetStep] = useState<BookingSheetStep>("detail");
  const [assignPersonId, setAssignPersonId] = useState("");
  const [assignRoomId, setAssignRoomId] = useState("");
  const [tenderInput, setTenderInput] = useState("");
  const [lastCash, setLastCash] = useState<{ tendered: number; change: number } | null>(null);
  const [receiptPayLabel, setReceiptPayLabel] = useState("Paid");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const agendaRef = useRef<HTMLDivElement | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

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

  const dayBookings = useMemo(() => {
    return bookings
      .filter((b) => b.starts_at && sameDay(new Date(b.starts_at), dayAnchor))
      .slice()
      .sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
  }, [bookings, dayAnchor]);

  const filteredAgenda = useMemo(() => {
    if (filterId === "all") return dayBookings;
    if (filterId === "unassigned") {
      return dayBookings.filter((b) => !b.person_id);
    }
    return dayBookings.filter((b) => String(b.person_id || "") === filterId);
  }, [dayBookings, filterId]);

  const agendaSlots = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const b of filteredAgenda) {
      const start = new Date(b.starts_at);
      const key = `${start.getHours()}:${String(start.getMinutes()).padStart(2, "0")}`;
      const list = groups.get(key) || [];
      list.push(b);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      start: new Date(items[0].starts_at),
      items,
    }));
  }, [filteredAgenda]);

  const columns = useMemo(() => {
    if (!profile.supportsResources) {
      return [{ id: "all", name: "Schedule", kind: "all" as const }];
    }
    const base =
      boardMode === "person"
        ? people.map((p) => ({ id: String(p.id), name: p.name, kind: "person" as const }))
        : rooms.map((r) => ({ id: String(r.id), name: r.name, kind: "room" as const }));
    const unassignedCount = dayBookings.filter((b) =>
      boardMode === "person" ? !b.person_id : !b.room_id,
    ).length;
    return unassignedCount > 0
      ? [...base, { id: "unassigned", name: "Unassigned", kind: "unassigned" as const }]
      : base.length
        ? base
        : [{ id: "all", name: "Schedule", kind: "all" as const }];
  }, [profile.supportsResources, boardMode, people, rooms, dayBookings]);

  const boardHours = useMemo(
    () => computeBoardHours(dayBookings, dayAnchor),
    [dayBookings, dayAnchor],
  );
  const dayStartHour = boardHours.startHour;
  const dayEndHour = boardHours.endHour;
  const totalMinutes = (dayEndHour - dayStartHour) * 60;
  const slotCount = totalMinutes / SLOT_MINUTES;

  const timeLabels = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i < slotCount; i++) {
      const mins = dayStartHour * 60 + i * SLOT_MINUTES;
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      labels.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
    return labels;
  }, [dayStartHour, slotCount]);

  const dueCount = useMemo(
    () => dayBookings.filter((b) => !isPaid(b.payment_status) && b.status !== "cancelled").length,
    [dayBookings],
  );

  function resourceBusy(
    kind: "person" | "room",
    resourceId: number | string,
    window: { start: Date; end: Date } | null,
    excludeBookingId?: number | null,
  ) {
    if (!window || resourceId === "" || resourceId == null) return null;
    const id = Number(resourceId);
    if (!id) return null;
    return (
      bookings.find((b) => {
        if (!isBlockingStatus(b.status)) return false;
        if (excludeBookingId && b.id === excludeBookingId) return false;
        if (kind === "person" && Number(b.person_id) !== id) return false;
        if (kind === "room" && Number(b.room_id) !== id) return false;
        const other = bookingWindow(b, bookingDurationMinutes(b));
        return other ? windowsOverlap(window, other) : false;
      }) || null
    );
  }

  const selectedWindow = useMemo(() => {
    if (!selected) return null;
    return bookingWindow(selected, bookingDurationMinutes(selected));
  }, [selected]);

  const createWindow = useMemo(() => {
    if (!startsAt) return null;
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) return null;
    const service = services.find((s) => String(s.id) === serviceId);
    const mins = Number(service?.duration_minutes || 60);
    return { start, end: new Date(start.getTime() + mins * 60000) };
  }, [startsAt, serviceId, services]);

  useEffect(() => {
    if (!showCreate || !createWindow) return;
    if (personId && resourceBusy("person", personId, createWindow)) {
      setPersonId("");
    }
    if (roomId && resourceBusy("room", roomId, createWindow)) {
      setRoomId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate, createWindow?.start.getTime(), createWindow?.end.getTime(), serviceId]);

  async function refresh() {
    if (!token) return;
    // Load a small window so assignment conflicts catch spillover / nearby days.
    const from = addDays(startOfDay(dayAnchor), -1).toISOString();
    const to = addDays(startOfDay(dayAnchor), 2).toISOString();
    const [range, c, s, r] = await Promise.all([
      api.bookings(token, { from, to }),
      api.customers(token),
      api.services(token),
      profile.supportsResources ? api.resources(token) : Promise.resolve([]),
    ]);
    setBookings(range);
    setCustomers(c);
    setServices(s);
    setResources(r);
    if (!serviceId && s[0]) setServiceId(String(s[0].id));
    if (selected) {
      const fresh = range.find((b: any) => b.id === selected.id);
      setSelected(fresh || null);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [token, dayAnchor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showCreate) {
        setShowCreate(false);
        return;
      }
      if (!selected) return;
      if (sheetStep === "cash" || sheetStep === "qr") {
        setSheetStep("pay");
        setError("");
        return;
      }
      if (sheetStep === "pay") {
        setSheetStep("detail");
        setError("");
        return;
      }
      closeBooking();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, sheetStep, showCreate]);

  useEffect(() => {
    if (view !== "agenda" || !agendaRef.current || !sameDay(dayAnchor, new Date())) return;
    const nowEl = agendaRef.current.querySelector("[data-now='1']");
    if (nowEl instanceof HTMLElement) {
      nowEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [view, dayAnchor, filteredAgenda.length]);

  useEffect(() => {
    if (view !== "board" || !boardScrollRef.current || !sameDay(dayAnchor, new Date())) return;
    const nowEl = boardScrollRef.current.querySelector("[data-now-line='1']");
    if (nowEl instanceof HTMLElement) {
      nowEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [view, dayAnchor, columns.length]);

  function openBooking(b: any) {
    setSelected(b);
    setSheetStep("detail");
    setAssignPersonId(b.person_id ? String(b.person_id) : "");
    setAssignRoomId(b.room_id ? String(b.room_id) : "");
    setTenderInput("");
    setLastCash(null);
    setReceiptPayLabel("Paid");
    setBusy(false);
    setShowCreate(false);
    setError("");
  }

  function closeBooking() {
    setSelected(null);
    setSheetStep("detail");
    setAssignPersonId("");
    setAssignRoomId("");
    setTenderInput("");
    setLastCash(null);
    setBusy(false);
    setError("");
  }

  function openCreateAt(columnId: string, slotIndex: number) {
    const mins = dayStartHour * 60 + slotIndex * SLOT_MINUTES;
    const start = new Date(dayAnchor);
    start.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    setStartsAt(toLocalDateTimeValue(start));
    if (profile.supportsResources) {
      if (boardMode === "person") {
        setPersonId(columnId === "unassigned" || columnId === "all" ? "" : columnId);
        setRoomId("");
      } else {
        setRoomId(columnId === "unassigned" || columnId === "all" ? "" : columnId);
        setPersonId("");
      }
    }
    setShowCreate(true);
    closeBooking();
  }

  function openCreateBlank() {
    const start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 30 : 60, 0, 0);
    if (!sameDay(start, dayAnchor)) {
      // keep selected day at 10:00
      const d = new Date(dayAnchor);
      d.setHours(10, 0, 0, 0);
      setStartsAt(toLocalDateTimeValue(d));
    } else {
      setStartsAt(toLocalDateTimeValue(start));
    }
    if (filterId !== "all" && filterId !== "unassigned") {
      setPersonId(filterId);
    }
    setShowCreate(true);
    closeBooking();
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    try {
      if (personId && resourceBusy("person", personId, createWindow)) {
        throw new Error("That staff member is already booked for this time");
      }
      if (roomId && resourceBusy("room", roomId, createWindow)) {
        throw new Error("That room is already booked for this time");
      }
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
    if (!token || !selected) return null;
    setError("");
    try {
      const updated = await api.updateBooking(token, selected.id, body);
      setSelected(updated);
      await refresh();
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update booking");
      return null;
    }
  }

  const dueAmount = selected ? amountDue(selected) : 0;
  const tendered = Number(tenderInput || 0);
  const changeDue = Math.max(0, tendered - dueAmount);
  const balanceDue = Math.max(0, dueAmount - tendered);
  const canTakeCash = tendered >= dueAmount && dueAmount >= 0;
  const assignDirty =
    Boolean(selected) &&
    (assignPersonId !== (selected.person_id ? String(selected.person_id) : "") ||
      assignRoomId !== (selected.room_id ? String(selected.room_id) : ""));
  const alreadyAssigned = Boolean(selected?.person_id || selected?.room_id);
  const assignLabel = alreadyAssigned ? "Reassign" : "Assign";

  function appendDigit(digit: string) {
    setTenderInput((prev) => {
      if (digit === ".") {
        if (prev.includes(".")) return prev;
        return prev ? `${prev}.` : "0.";
      }
      if (prev === "0") return digit;
      const parts = prev.split(".");
      if (parts[1] && parts[1].length >= 2) return prev;
      if (prev.length >= 10) return prev;
      return `${prev}${digit}`;
    });
  }

  async function onAssign() {
    if (!selected || !token) return;
    if (assignPersonId && resourceBusy("person", assignPersonId, selectedWindow, selected.id)) {
      setError(`That ${profile.personNoun.toLowerCase()} is already booked for this time`);
      return;
    }
    if (assignRoomId && resourceBusy("room", assignRoomId, selectedWindow, selected.id)) {
      setError(`That ${profile.roomNoun.toLowerCase()} is already booked for this time`);
      return;
    }
    setBusy(true);
    const updated = await patchSelected({
      person_id: assignPersonId ? Number(assignPersonId) : null,
      room_id: assignRoomId ? Number(assignRoomId) : null,
    });
    setBusy(false);
    if (updated) closeBooking();
  }

  async function onComplete() {
    if (!selected || !token) return;
    setError("");

    // Persist any pending staff/room picks before leaving the detail sheet.
    if (profile.supportsResources && assignDirty) {
      if (assignPersonId && resourceBusy("person", assignPersonId, selectedWindow, selected.id)) {
        setError(`That ${profile.personNoun.toLowerCase()} is already booked for this time`);
        return;
      }
      if (assignRoomId && resourceBusy("room", assignRoomId, selectedWindow, selected.id)) {
        setError(`That ${profile.roomNoun.toLowerCase()} is already booked for this time`);
        return;
      }
      setBusy(true);
      const assigned = await patchSelected({
        person_id: assignPersonId ? Number(assignPersonId) : null,
        room_id: assignRoomId ? Number(assignRoomId) : null,
      });
      setBusy(false);
      if (!assigned) return;
    }

    // Same POS checkout path:
    // unpaid / deposit due → choose payment (cash / QR) → receipt
    // already paid → mark completed (if needed) → receipt (print / WhatsApp)
    if (!isPaid(selected.payment_status)) {
      setTenderInput("");
      setLastCash(null);
      setSheetStep("pay");
      return;
    }

    setBusy(true);
    let booking = selected;
    if (booking.status !== "completed") {
      const updated = await patchSelected({ status: "completed" });
      setBusy(false);
      if (!updated) return;
      booking = updated;
    } else {
      setBusy(false);
    }
    setLastCash(null);
    setReceiptPayLabel(
      booking.payment_status === "deposit_paid" ? "Deposit paid" : "Paid",
    );
    setSheetStep("receipt");
  }

  async function completeWithCash() {
    if (!selected || !token) return;
    if (!canTakeCash) {
      setError("Cash received must cover the amount due");
      return;
    }
    setBusy(true);
    const cashNote = `Cash received ${selected.currency} ${tendered.toFixed(2)}; change ${selected.currency} ${changeDue.toFixed(2)}`;
    const notes = [selected.notes, cashNote].filter(Boolean).join(" · ");
    const updated = await patchSelected({
      payment_status: "paid",
      status: "completed",
      notes,
    });
    setBusy(false);
    if (!updated) return;
    setLastCash({ tendered, change: changeDue });
    setReceiptPayLabel("Cash");
    setSheetStep("receipt");
  }

  async function completeAfterQrPaid() {
    if (!selected || !token) return;
    setBusy(true);
    const updated = await patchSelected({ status: "completed" });
    setBusy(false);
    if (!updated) return;
    setLastCash(null);
    setReceiptPayLabel("QR / online");
    setSheetStep("receipt");
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

  function blockStyle(
    b: any,
    lane = 0,
    laneCount = 1,
  ): { top: string; height: string; left: string; width: string } {
    const start = new Date(b.starts_at);
    const duration = bookingDurationMinutes(b);
    const startMins = minutesOnDay(start, dayAnchor) - dayStartHour * 60;
    const rawTop = (startMins / totalMinutes) * 100;
    const rawHeight = (duration / totalMinutes) * 100;
    // Clamp so late/early bookings never paint outside the column body.
    const top = Math.min(Math.max(rawTop, 0), 100);
    const height = Math.min(Math.max(rawHeight, 4.5), Math.max(100 - top, 4.5));
    const gap = 1.5;
    const width = (100 - gap * (laneCount + 1)) / laneCount;
    const left = gap + lane * (width + gap);
    return {
      top: `${top}%`,
      height: `${height}%`,
      left: `${left}%`,
      width: `${width}%`,
    };
  }

  const isToday = sameDay(dayAnchor, new Date());
  const now = Date.now();
  const nowPct = nowBoardPercent(dayAnchor, dayStartHour, totalMinutes);
  const nowLabel = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={`bookings-app ${view === "agenda" ? "is-agenda" : "is-board"}`}>
      <header className="bookings-top">
        <div className="bookings-date-nav">
          <button
            type="button"
            className="bookings-nav-btn"
            aria-label="Previous day"
            onClick={() => setDayAnchor(addDays(dayAnchor, -1))}
          >
            ‹
          </button>
          <div className="bookings-date-label">
            <strong>{isToday ? "Today" : formatDayShort(dayAnchor)}</strong>
            <span>{formatDayLong(dayAnchor)}</span>
          </div>
          <button
            type="button"
            className="bookings-nav-btn"
            aria-label="Next day"
            onClick={() => setDayAnchor(addDays(dayAnchor, 1))}
          >
            ›
          </button>
          {!isToday ? (
            <button
              type="button"
              className="btn secondary bookings-today-btn"
              onClick={() => setDayAnchor(startOfDay(new Date()))}
            >
              Today
            </button>
          ) : null}
        </div>

        <div className="bookings-top-actions">
          <div className="segmented">
            <button
              type="button"
              className={view === "agenda" ? "active" : ""}
              onClick={() => setView("agenda")}
            >
              Agenda
            </button>
            <button
              type="button"
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              Board
            </button>
          </div>
          <button type="button" className="btn" onClick={openCreateBlank}>
            New
          </button>
        </div>
      </header>

      <div className="bookings-summary">
        <span>
          <strong>{dayBookings.length}</strong> booking{dayBookings.length === 1 ? "" : "s"}
        </span>
        {dueCount > 0 ? (
          <span className="bookings-summary-due">
            <strong>{dueCount}</strong> need payment
          </span>
        ) : (
          <span className="muted">All clear on payments</span>
        )}
      </div>

      {profile.supportsResources && people.length > 0 && view === "agenda" ? (
        <div className="bookings-filters">
          <button
            type="button"
            className={`bookings-chip ${filterId === "all" ? "active" : ""}`}
            onClick={() => setFilterId("all")}
          >
            Everyone
          </button>
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`bookings-chip ${filterId === String(p.id) ? "active" : ""}`}
              onClick={() => setFilterId(String(p.id))}
            >
              {p.name}
            </button>
          ))}
          {dayBookings.some((b) => !b.person_id) ? (
            <button
              type="button"
              className={`bookings-chip ${filterId === "unassigned" ? "active" : ""}`}
              onClick={() => setFilterId("unassigned")}
            >
              Unassigned
            </button>
          ) : null}
        </div>
      ) : null}

      {profile.supportsResources && view === "board" ? (
        <div className="bookings-filters">
          <button
            type="button"
            className={`bookings-chip ${boardMode === "person" ? "active" : ""}`}
            onClick={() => setBoardMode("person")}
          >
            By {profile.personNoun.toLowerCase()}
          </button>
          <button
            type="button"
            className={`bookings-chip ${boardMode === "room" ? "active" : ""}`}
            onClick={() => setBoardMode("room")}
          >
            By {profile.roomNoun.toLowerCase()}
          </button>
        </div>
      ) : null}

      {error && !showCreate ? <div className="error">{error}</div> : null}

      {view === "agenda" ? (
        <section className="bookings-agenda" ref={agendaRef}>
          {filteredAgenda.length === 0 ? (
            <div className="bookings-empty">
              <strong>No bookings {isToday ? "today" : "this day"}</strong>
              <p>Tap New, or switch days with the arrows above.</p>
              <button type="button" className="btn" onClick={openCreateBlank}>
                New booking
              </button>
            </div>
          ) : (
            agendaSlots.map((slot) => {
              const count = slot.items.length;
              const dense = count >= 2;
              const slotNow = slot.items.some((b) => {
                const start = new Date(b.starts_at);
                const end = b.ends_at
                  ? new Date(b.ends_at)
                  : new Date(start.getTime() + bookingDurationMinutes(b) * 60000);
                return now >= start.getTime() && now < end.getTime();
              });
              return (
                <div
                  key={slot.key}
                  className={`agenda-slot count-${Math.min(count, 3)} ${dense ? "dense" : "single"}`}
                  data-now={slotNow ? "1" : "0"}
                >
                  <div className="agenda-time">
                    <strong>{formatTime(slot.start)}</strong>
                    <span>
                      {count > 1 ? `${count} bookings` : `${bookingDurationMinutes(slot.items[0])}m`}
                    </span>
                  </div>
                  <div
                    className="agenda-slot-cards"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(count, 3)}, minmax(0, 1fr))`,
                    }}
                  >
                    {slot.items.map((b) => {
                      const start = new Date(b.starts_at);
                      const end = b.ends_at
                        ? new Date(b.ends_at)
                        : new Date(start.getTime() + bookingDurationMinutes(b) * 60000);
                      const isNow = now >= start.getTime() && now < end.getTime();
                      const isPast = end.getTime() < now && isToday;
                      const name = b.customer?.name || b.customer?.phone || "Guest";
                      const staffName = b.person?.name || "";
                      const roomName = b.room?.name || "";
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className={`agenda-card pay-${paymentTone(b.payment_status)} ${dense ? "shared" : ""} ${isNow ? "now" : ""} ${isPast ? "past" : ""} ${b.status === "cancelled" ? "cancelled" : ""}`}
                          onClick={() => openBooking(b)}
                        >
                          <span className="agenda-avatar">{initials(name)}</span>
                          <div className="agenda-main">
                            <strong className="agenda-guest">{name}</strong>
                            <div className="agenda-meta">{b.service?.name || "Booking"}</div>
                            <div className="agenda-money muted">
                              {b.currency} {amountDue(b).toFixed(2)}
                              {b.status === "cancelled" ? " · Cancelled" : ""}
                            </div>
                          </div>
                          <div className="agenda-pills">
                            <span className={`agenda-pill pay-${paymentTone(b.payment_status)}`}>
                              {paymentLabel(b.payment_status)}
                            </span>
                            {staffName ? (
                              <span className="agenda-pill staff" title={profile.personNoun}>
                                {staffName}
                              </span>
                            ) : null}
                            {roomName ? (
                              <span className="agenda-pill room" title={profile.roomNoun}>
                                {roomName}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </section>
      ) : (
        <section className="panel calendar-panel bookings-board-panel">
          <div className="day-board-scroll" ref={boardScrollRef}>
            <div
              className="day-board"
              style={{
                gridTemplateColumns: `64px repeat(${Math.max(columns.length, 1)}, minmax(168px, 1fr))`,
                ["--board-slots" as string]: String(slotCount),
              }}
            >
              <div className="day-board-hours">
                <div className="day-board-corner">
                  <span>Time</span>
                </div>
                {timeLabels.map((label, idx) => {
                  const hourMins = dayStartHour * 60 + idx * SLOT_MINUTES;
                  const isCurrentHour =
                    isToday &&
                    (() => {
                      const n = new Date();
                      const nowMins = n.getHours() * 60 + n.getMinutes();
                      return nowMins >= hourMins && nowMins < hourMins + SLOT_MINUTES;
                    })();
                  return (
                    <div
                      key={label}
                      className={`day-board-hour ${idx % 2 === 0 ? "hour" : "half"} ${isCurrentHour ? "is-now" : ""}`}
                    >
                      {idx % 2 === 0 ? label : ""}
                    </div>
                  );
                })}
              </div>

              {columns.map((col) => {
                const colBookings = bookingsForColumn(col.id);
                const laidOut = layoutBoardLanes(colBookings);
                const dueInCol = colBookings.filter(
                  (b) => !isPaid(b.payment_status) && b.status !== "cancelled",
                ).length;
                return (
                  <div
                    key={col.id}
                    className={`day-board-col ${col.kind === "unassigned" ? "unassigned" : ""}`}
                  >
                    <div className="day-board-col-head">
                      <strong>{col.name}</strong>
                      <span className="day-board-col-meta">
                        <span className="muted">
                          {colBookings.length} booking{colBookings.length === 1 ? "" : "s"}
                        </span>
                        {dueInCol > 0 ? (
                          <span className="board-due-chip">{dueInCol} due</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="day-board-col-body">
                      {timeLabels.map((label, idx) => {
                        const hourMins = dayStartHour * 60 + idx * SLOT_MINUTES;
                        const n = new Date();
                        const nowMins = n.getHours() * 60 + n.getMinutes();
                        const isCurrentHour =
                          isToday && nowMins >= hourMins && nowMins < hourMins + SLOT_MINUTES;
                        return (
                          <button
                            key={label}
                            type="button"
                            className={`day-board-slot ${idx % 2 === 0 ? "hour" : "half"} ${isCurrentHour ? "is-now" : ""}`}
                            title={`Book ${label} · ${col.name}`}
                            onClick={() => openCreateAt(col.id, idx)}
                          />
                        );
                      })}

                      {nowPct != null ? (
                        <div
                          className="day-board-now"
                          data-now-line="1"
                          style={{ top: `${nowPct}%` }}
                          aria-hidden="true"
                        >
                          <span className="day-board-now-dot" />
                          {col === columns[0] ? (
                            <span className="day-board-now-label">{nowLabel}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {laidOut.map(({ booking: b, lane, laneCount }) => {
                        const start = new Date(b.starts_at);
                        const end = b.ends_at
                          ? new Date(b.ends_at)
                          : new Date(start.getTime() + bookingDurationMinutes(b) * 60000);
                        const isNow = now >= start.getTime() && now < end.getTime();
                        const isPast = end.getTime() < now && isToday;
                        const guest = b.customer?.name || b.customer?.phone || "Guest";
                        return (
                          <button
                            key={b.id}
                            type="button"
                            className={[
                              "calendar-event",
                              "day-board-event",
                              `pay-${b.payment_status}`,
                              isNow ? "now" : "",
                              isPast ? "past" : "",
                              b.status === "cancelled" ? "cancelled" : "",
                              b.status === "completed" ? "completed" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={blockStyle(b, lane, laneCount)}
                            onClick={(e) => {
                              e.stopPropagation();
                              openBooking(b);
                            }}
                            title={`${formatTime(b.starts_at)} · ${guest} · ${b.service?.name || "Booking"} · ${paymentLabel(b.payment_status)}`}
                          >
                            <span className="board-event-top">
                              <strong>{formatTime(b.starts_at)}</strong>
                              <span
                                className={`board-event-pay pay-${paymentTone(b.payment_status)}`}
                              >
                                {paymentLabel(b.payment_status)}
                              </span>
                            </span>
                            <span className="board-event-guest">{guest}</span>
                            <span className="board-event-service">
                              {b.service?.name || "Booking"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {selected && sheetStep === "detail" ? (
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
                <h2 id="booking-modal-title">
                  {selected.customer?.name || selected.customer?.phone || "Booking"}
                </h2>
                <p>
                  {selected.service?.name || "Service"}
                  {selected.starts_at ? ` · ${formatTime(selected.starts_at)}` : ""}
                </p>
              </div>
              <button type="button" className="btn secondary" onClick={closeBooking}>
                Close
              </button>
            </div>

            <div className="booking-sheet-status">
              <span className={`agenda-pay pay-${paymentTone(selected.payment_status)}`}>
                {paymentLabel(selected.payment_status)}
              </span>
              <span className="badge">{selected.status}</span>
              <span className="muted">
                {selected.currency} {dueAmount.toFixed(2)}
              </span>
            </div>

            {profile.supportsResources ? (
              <div className="booking-assign-row">
                <label>
                  {profile.personNoun}
                  <select
                    value={assignPersonId}
                    onChange={(e) => setAssignPersonId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {people.map((p) => {
                      const clash = resourceBusy("person", p.id, selectedWindow, selected.id);
                      return (
                        <option key={p.id} value={p.id} disabled={Boolean(clash)}>
                          {clash ? `${p.name} · busy` : p.name}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  {profile.roomNoun}
                  <select value={assignRoomId} onChange={(e) => setAssignRoomId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {rooms.map((r) => {
                      const clash = resourceBusy("room", r.id, selectedWindow, selected.id);
                      return (
                        <option key={r.id} value={r.id} disabled={Boolean(clash)}>
                          {clash ? `${r.name} · busy` : r.name}
                        </option>
                      );
                    })}
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
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="btn-row booking-sheet-actions">
              {profile.supportsResources ? (
                <button
                  type="button"
                  className={assignDirty ? "btn" : "btn secondary"}
                  disabled={busy || !assignDirty}
                  onClick={() => void onAssign()}
                >
                  {busy ? "Saving…" : assignLabel}
                </button>
              ) : null}
              {selected.status !== "cancelled" ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void onComplete()}
                >
                  Complete
                </button>
              ) : null}
              {selected.status !== "cancelled" ? (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void patchSelected({ status: "cancelled" }).then((u) => u && closeBooking())}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {selected && sheetStep === "pay" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-pay-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2 id="booking-pay-title">Choose payment</h2>
                <p>
                  {selected.customer?.name || selected.customer?.phone || "Customer"} ·{" "}
                  {selected.currency} {dueAmount.toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setSheetStep("detail");
                  setError("");
                }}
              >
                Back
              </button>
            </div>

            <div className="pos-pay-options">
              <button
                type="button"
                className="pos-pay-option"
                disabled={busy}
                onClick={() => {
                  setTenderInput("");
                  setError("");
                  setSheetStep("cash");
                }}
              >
                <strong>Cash</strong>
                <span className="muted">Enter cash received and calculate change</span>
              </button>
              <button
                type="button"
                className="pos-pay-option"
                disabled={busy || !selected.payment_url}
                onClick={() => {
                  setError("");
                  setSheetStep("qr");
                }}
                title={selected.payment_url ? "Show payment QR" : "No payment link on this booking"}
              >
                <strong>QR pay</strong>
                <span className="muted">
                  {selected.payment_url
                    ? "Show a payment QR for the customer"
                    : "Payment link unavailable"}
                </span>
              </button>
            </div>
            {error ? <div className="error">{error}</div> : null}
          </div>
        </div>
      ) : null}

      {selected && sheetStep === "cash" ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-cash-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bookings-toolbar">
              <div>
                <h2 id="booking-cash-title">Cash received</h2>
                <p>
                  Amount due {selected.currency} {dueAmount.toFixed(2)} — change prints on the
                  receipt.
                </p>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setSheetStep("pay");
                  setError("");
                }}
              >
                Back
              </button>
            </div>

            <div className="pos-calc">
              <div className="pos-calc-readout">
                <div>
                  <span className="muted">Cash received</span>
                  <strong>
                    {selected.currency} {tenderInput ? tenderInput : "0"}
                  </strong>
                </div>
                <div className={balanceDue > 0 ? "pos-balance warn" : "pos-balance ok"}>
                  <span className="muted">{balanceDue > 0 ? "Still due" : "Change"}</span>
                  <strong>
                    {selected.currency} {(balanceDue > 0 ? balanceDue : changeDue).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div className="pos-keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="pos-key"
                    onClick={() => {
                      if (key === "⌫") setTenderInput((prev) => prev.slice(0, -1));
                      else appendDigit(key);
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="btn-row pos-calc-tools">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setTenderInput(dueAmount.toFixed(2))}
                >
                  Exact
                </button>
                <button type="button" className="btn secondary" onClick={() => setTenderInput("")}>
                  Clear
                </button>
              </div>
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="btn-row pos-actions">
              <button
                type="button"
                className="btn"
                disabled={busy || !canTakeCash}
                onClick={() => void completeWithCash()}
              >
                {busy ? "Saving…" : "Take cash & issue receipt"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selected && sheetStep === "qr" && selected.payment_url ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <QrPayPanel
              paymentUrl={selected.payment_url}
              amountLabel={`${selected.currency} ${dueAmount.toFixed(2)}`}
              subtitle={`Booking #${selected.id}`}
              onPaid={() => void completeAfterQrPaid()}
              onClose={() => {
                setSheetStep("pay");
                setError("");
              }}
            />
          </div>
        </div>
      ) : null}

      {selected && sheetStep === "receipt" ? (
        <div className="modal-backdrop" onClick={closeBooking} role="presentation">
          <div
            className="modal-card booking-modal pos-flow-modal receipt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-receipt-title"
            onClick={(e) => e.stopPropagation()}
          >
            <SaleReceipt
              token={token}
              shopName={user?.tenant?.name || "BaseApp"}
              bookingId={selected.id}
              customerName={selected.customer?.name || selected.customer?.phone || "Customer"}
              customerPhone={selected.customer?.phone || ""}
              lineItems={[selected.service?.name || "Booking"]}
              currency={selected.currency || "MYR"}
              amountDue={Number(selected.amount || dueAmount || 0)}
              paymentLabel={receiptPayLabel}
              cash={lastCash}
              paidAt={selected.paid_at}
              doneLabel="Done"
              onDone={closeBooking}
              onClose={closeBooking}
            />
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
                <p>Quick add for walk-ins or phone bookings.</p>
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
                    {people.map((p) => {
                      const clash = resourceBusy("person", p.id, createWindow);
                      return (
                        <option key={p.id} value={p.id} disabled={Boolean(clash)}>
                          {clash ? `${p.name} · busy` : p.name}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  {profile.roomNoun}
                  <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {rooms.map((r) => {
                      const clash = resourceBusy("room", r.id, createWindow);
                      return (
                        <option key={r.id} value={r.id} disabled={Boolean(clash)}>
                          {clash ? `${r.name} · busy` : r.name}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <p className="muted booking-assign-hint">
                  Staff or rooms already booked for this time are disabled.
                </p>
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
