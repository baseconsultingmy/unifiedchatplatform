from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingStatus,
    Channel,
    Conversation,
    Message,
    MessageDirection,
    PaymentStatus,
    Service,
    Tenant,
)
from app.payments import amount_due, attach_payment_link, mark_booking_paid
from app.whatsapp_client import (
    WhatsAppSendError,
    send_list_message,
    send_reply_buttons,
    send_text_message,
)
from app.whatsapp_creds import resolve_whatsapp_credentials
from app.whatsapp_receipt import deliver_booking_receipt

MENU_WORDS = {"hi", "hello", "menu", "book", "start", "help", "services", "hola", "packages"}
CANCEL_WORDS = {"cancel", "stop", "reset"}

# Customer-facing booking window (local shop time).
OPEN_HOUR = 10
CLOSE_HOUR = 20
SLOT_STEP_MINUTES = 30
DATE_OPTIONS = 7  # WhatsApp list allows 10 rows; keep headroom
SLOT_PAGE_SIZE = 9  # + optional "More times" row


def _ctx(conversation: Conversation) -> dict:
    if not conversation.flow_context:
        return {}
    try:
        return json.loads(conversation.flow_context)
    except json.JSONDecodeError:
        return {}


def _set_ctx(conversation: Conversation, data: dict | None) -> None:
    conversation.flow_context = json.dumps(data or {})


def _set_state(conversation: Conversation, state: str, data: dict | None = None) -> None:
    conversation.flow_state = state
    if data is not None:
        _set_ctx(conversation, data)


def _wa_creds(tenant: Tenant) -> tuple[str | None, str | None]:
    return resolve_whatsapp_credentials(tenant)


def _send_kwargs(tenant: Tenant) -> dict:
    token, phone_id = _wa_creds(tenant)
    return {"access_token": token, "phone_number_id": phone_id}


def _tenant_tz(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone or "Asia/Kuala_Lumpur")
    except Exception:
        return ZoneInfo("Asia/Kuala_Lumpur")


def _store_outbound(
    db: Session,
    conversation: Conversation,
    body: str,
    result: dict | None = None,
) -> None:
    external_id = None
    if result:
        messages = result.get("messages") or []
        if messages:
            external_id = messages[0].get("id")
    conversation.last_message_at = datetime.now(timezone.utc)
    db.add(
        Message(
            conversation_id=conversation.id,
            direction=MessageDirection.outbound,
            body=body,
            raw_payload=json.dumps(result) if result else None,
            external_message_id=external_id,
        )
    )


def _try_send(
    db: Session,
    conversation: Conversation,
    *,
    body_for_inbox: str,
    send_fn,
) -> dict | None:
    """Send WhatsApp message without aborting the booking state machine on API errors."""
    try:
        result = send_fn()
        _store_outbound(db, conversation, body_for_inbox, result)
        return result
    except WhatsAppSendError as exc:
        _store_outbound(
            db,
            conversation,
            f"{body_for_inbox}\n\n[send failed: {exc}]",
            {"error": exc.payload or str(exc)},
        )
        return None


def _active_services(db: Session, tenant_id: int) -> list[Service]:
    return (
        db.query(Service)
        .filter(Service.tenant_id == tenant_id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .all()
    )


def _service_ctx(service: Service) -> dict:
    return {
        "service_id": service.id,
        "service_name": service.name,
        "amount": str(service.price_amount),
        "currency": service.currency,
        "deposit_amount": str(service.deposit_amount),
        "duration_minutes": int(service.duration_minutes or 60),
    }


def _busy_bookings(db: Session, tenant_id: int, day_start_utc: datetime, day_end_utc: datetime) -> list[Booking]:
    return (
        db.query(Booking)
        .filter(
            Booking.tenant_id == tenant_id,
            Booking.starts_at.is_not(None),
            Booking.ends_at.is_not(None),
            Booking.status.in_([BookingStatus.held, BookingStatus.confirmed]),
            Booking.starts_at < day_end_utc,
            Booking.ends_at > day_start_utc,
        )
        .all()
    )


def _slot_conflicts(starts: datetime, ends: datetime, busy: list[Booking]) -> bool:
    for b in busy:
        if b.starts_at is None or b.ends_at is None:
            continue
        if starts < b.ends_at and ends > b.starts_at:
            return True
    return False


def _available_slots(
    db: Session,
    tenant: Tenant,
    *,
    day: date,
    duration_minutes: int,
) -> list[datetime]:
    """Return available local-time slot starts for a shop day."""
    tz = _tenant_tz(tenant)
    now_local = datetime.now(tz)
    day_start_local = datetime(day.year, day.month, day.day, OPEN_HOUR, 0, tzinfo=tz)
    day_end_local = datetime(day.year, day.month, day.day, CLOSE_HOUR, 0, tzinfo=tz)
    busy = _busy_bookings(
        db,
        tenant.id,
        day_start_local.astimezone(timezone.utc),
        day_end_local.astimezone(timezone.utc),
    )

    duration = max(int(duration_minutes or 60), SLOT_STEP_MINUTES)
    slots: list[datetime] = []
    cursor = day_start_local
    while cursor + timedelta(minutes=duration) <= day_end_local:
        ends = cursor + timedelta(minutes=duration)
        # Skip past slots for today
        if cursor > now_local + timedelta(minutes=5) and not _slot_conflicts(
            cursor.astimezone(timezone.utc),
            ends.astimezone(timezone.utc),
            busy,
        ):
            slots.append(cursor)
        cursor += timedelta(minutes=SLOT_STEP_MINUTES)
    return slots


def _date_label(day: date, today: date) -> str:
    if day == today:
        return "Today"
    if day == today + timedelta(days=1):
        return "Tomorrow"
    return day.strftime("%a %d %b")


def _slot_id(dt: datetime) -> str:
    return f"slot_{dt.strftime('%Y%m%d%H%M')}"


def _parse_slot_id(slot_id: str, tz: ZoneInfo) -> datetime | None:
    raw = slot_id.removeprefix("slot_")
    try:
        dt = datetime.strptime(raw, "%Y%m%d%H%M")
        return dt.replace(tzinfo=tz)
    except ValueError:
        return None


def send_services_menu(db: Session, tenant: Tenant, conversation: Conversation, to_phone: str) -> None:
    services = _active_services(db, tenant.id)
    if not services:
        body = (
            f"Welcome to {tenant.name}!\n\n"
            "No packages are published yet. Please message us again later or chat with our team."
        )
        _set_state(conversation, "idle", {})
        _try_send(
            db,
            conversation,
            body_for_inbox="Welcome — no packages published yet.",
            send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
        )
        return

    rows = []
    for s in services:
        price = f"{s.currency} {s.price_amount}"
        desc = f"{s.duration_minutes} min · {price}"
        if float(s.deposit_amount or 0) > 0:
            desc += f" · deposit {s.currency} {s.deposit_amount}"
        rows.append({"id": f"svc_{s.id}", "title": s.name[:24], "description": desc})

    body = (
        f"Welcome to {tenant.name}!\n\n"
        "Let's book in one flow:\n"
        "1) Package  2) Date  3) Time  4) Confirm & pay\n\n"
        "Choose a package below. Type *menu* anytime to restart."
    )
    _set_state(conversation, "choosing_service", {})
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[package list sent]",
        send_fn=lambda: send_list_message(
            to_phone=to_phone,
            body=body,
            button_label="View packages",
            section_title="Packages",
            rows=rows,
            **_send_kwargs(tenant),
        ),
    )


def _ask_date(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    ctx: dict,
) -> None:
    tz = _tenant_tz(tenant)
    today = datetime.now(tz).date()
    rows = []
    for offset in range(DATE_OPTIONS):
        day = today + timedelta(days=offset)
        rows.append(
            {
                "id": f"day_{day.isoformat()}",
                "title": _date_label(day, today),
                "description": day.strftime("%d %b %Y"),
            }
        )

    body = (
        f"*{ctx.get('service_name')}* selected "
        f"({ctx.get('duration_minutes')} min, {ctx.get('currency')} {ctx.get('amount')}).\n\n"
        "Pick a date:"
    )
    _set_state(conversation, "awaiting_date", {**ctx, "slot_page": 0})
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[date list sent]",
        send_fn=lambda: send_list_message(
            to_phone=to_phone,
            body=body,
            button_label="Choose date",
            section_title="Dates",
            rows=rows,
            **_send_kwargs(tenant),
        ),
    )


def _ask_slot(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    ctx: dict,
    *,
    page: int = 0,
) -> None:
    day = date.fromisoformat(ctx["selected_date"])
    duration = int(ctx.get("duration_minutes") or 60)
    slots = _available_slots(db, tenant, day=day, duration_minutes=duration)
    page = max(0, page)
    start = page * SLOT_PAGE_SIZE
    page_slots = slots[start : start + SLOT_PAGE_SIZE]
    has_more = len(slots) > start + SLOT_PAGE_SIZE

    if not page_slots:
        body = (
            f"No open slots on *{day.strftime('%a %d %b')}* for "
            f"{ctx.get('service_name')}.\n\nPlease pick another date."
        )
        _try_send(
            db,
            conversation,
            body_for_inbox=body,
            send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
        )
        _ask_date(db, tenant, conversation, to_phone, ctx)
        return

    rows = [
        {
            "id": _slot_id(slot),
            "title": slot.strftime("%I:%M %p").lstrip("0"),
            "description": "Available",
        }
        for slot in page_slots
    ]
    if has_more:
        rows.append(
            {
                "id": f"slotmore_{page + 1}",
                "title": "More times",
                "description": f"{len(slots) - start - SLOT_PAGE_SIZE} more slots",
            }
        )

    day_label = day.strftime("%a %d %b")
    body = (
        f"*{ctx.get('service_name')}* · {day_label}\n\n"
        "Pick a time slot:"
    )
    _set_state(conversation, "awaiting_slot", {**ctx, "slot_page": page})
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[slot list sent]",
        send_fn=lambda: send_list_message(
            to_phone=to_phone,
            body=body,
            button_label="Choose time",
            section_title="Time slots",
            rows=rows,
            **_send_kwargs(tenant),
        ),
    )


def _ask_confirm(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    ctx: dict,
) -> None:
    starts_at = datetime.fromisoformat(ctx["starts_at"])
    tz = _tenant_tz(tenant)
    when_label = starts_at.astimezone(tz).strftime("%a %d %b · %I:%M %p").replace(" 0", " ")
    body = (
        "Please confirm your booking:\n\n"
        f"• Package: {ctx.get('service_name')}\n"
        f"• When: {when_label}\n"
        f"• Duration: {ctx.get('duration_minutes')} min\n"
        f"• Price: {ctx.get('currency')} {ctx.get('amount')}\n"
    )
    deposit = Decimal(str(ctx.get("deposit_amount") or "0"))
    if deposit > 0:
        body += f"• Deposit due now: {ctx.get('currency')} {deposit}\n"
    body += "\nConfirm to hold the slot?"

    _set_state(conversation, "awaiting_confirm", ctx)
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[Confirm/Cancel buttons]",
        send_fn=lambda: send_reply_buttons(
            to_phone=to_phone,
            body=body,
            buttons=[
                {"id": "confirm_yes", "title": "Confirm"},
                {"id": "confirm_no", "title": "Cancel"},
            ],
            **_send_kwargs(tenant),
        ),
    )


def _create_booking(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    ctx: dict,
) -> Booking:
    service_id = int(ctx["service_id"])
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.tenant_id == tenant.id)
        .first()
    )
    starts_at = None
    if ctx.get("starts_at"):
        try:
            starts_at = datetime.fromisoformat(ctx["starts_at"])
        except ValueError:
            starts_at = None
    ends_at = None
    duration = int(ctx.get("duration_minutes") or (service.duration_minutes if service else 60) or 60)
    if starts_at:
        ends_at = starts_at + timedelta(minutes=duration)

    # Re-check availability at confirm time to avoid double-booking races.
    if starts_at and ends_at:
        busy = _busy_bookings(
            db,
            tenant.id,
            starts_at.astimezone(timezone.utc) - timedelta(hours=1),
            ends_at.astimezone(timezone.utc) + timedelta(hours=1),
        )
        if _slot_conflicts(starts_at.astimezone(timezone.utc), ends_at.astimezone(timezone.utc), busy):
            raise ValueError("slot_taken")

    amount = Decimal(str(ctx.get("amount") or "0"))
    deposit = Decimal(str(ctx.get("deposit_amount") or "0"))
    if service is not None and deposit <= 0:
        deposit = Decimal(str(service.deposit_amount or 0))

    booking = Booking(
        tenant_id=tenant.id,
        customer_id=conversation.customer_id,
        service_id=service_id,
        channel=Channel.whatsapp,
        status=BookingStatus.held,
        payment_status=PaymentStatus.deposit_due if deposit > 0 else PaymentStatus.unpaid,
        starts_at=starts_at,
        ends_at=ends_at,
        amount=amount,
        deposit_amount=deposit,
        currency=ctx.get("currency") or "MYR",
        notes=ctx.get("preferred_text") or ctx.get("when_label"),
        external_ref=f"wa-{conversation.id}-{int(datetime.now(timezone.utc).timestamp())}",
    )
    db.add(booking)
    db.flush()
    attach_payment_link(db, booking)
    return booking


def handle_inbound_message(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    msg: dict,
) -> None:
    """One WhatsApp booking flow: package → date → time slot → confirm → pay."""
    to_phone = conversation.external_thread_id
    msg_type = msg.get("type")
    text = ""
    list_id = None
    button_id = None

    if msg_type == "text":
        text = ((msg.get("text") or {}).get("body") or "").strip()
    elif msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        if interactive.get("type") == "list_reply":
            list_id = (interactive.get("list_reply") or {}).get("id")
            text = (interactive.get("list_reply") or {}).get("title") or ""
        elif interactive.get("type") == "button_reply":
            button_id = (interactive.get("button_reply") or {}).get("id")
            text = (interactive.get("button_reply") or {}).get("title") or ""
    else:
        return

    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    state = conversation.flow_state or "idle"
    ctx = _ctx(conversation)
    tz = _tenant_tz(tenant)

    if normalized in CANCEL_WORDS or button_id == "confirm_no":
        _set_state(conversation, "idle", {})
        _try_send(
            db,
            conversation,
            body_for_inbox="Cancelled. Type menu to restart.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="Cancelled. Type *menu* to see packages again.",
                **_send_kwargs(tenant),
            ),
        )
        return

    # --- Package selected ---
    if list_id and list_id.startswith("svc_"):
        service_id = int(list_id.split("_", 1)[1])
        service = (
            db.query(Service)
            .filter(
                Service.id == service_id,
                Service.tenant_id == tenant.id,
                Service.is_active.is_(True),
            )
            .first()
        )
        if not service:
            _set_state(conversation, "idle", {})
            _try_send(
                db,
                conversation,
                body_for_inbox="Package unavailable.",
                send_fn=lambda: send_text_message(
                    to_phone=to_phone,
                    body="That package is unavailable. Type *menu* to choose again.",
                    **_send_kwargs(tenant),
                ),
            )
            return
        _ask_date(db, tenant, conversation, to_phone, _service_ctx(service))
        return

    # --- Date selected ---
    if list_id and list_id.startswith("day_"):
        day_raw = list_id.removeprefix("day_")
        try:
            selected = date.fromisoformat(day_raw)
        except ValueError:
            _try_send(
                db,
                conversation,
                body_for_inbox="Invalid date.",
                send_fn=lambda: send_text_message(
                    to_phone=to_phone,
                    body="That date wasn't valid. Type *menu* to restart.",
                    **_send_kwargs(tenant),
                ),
            )
            return
        if not ctx.get("service_id"):
            send_services_menu(db, tenant, conversation, to_phone)
            return
        ctx = {**ctx, "selected_date": selected.isoformat(), "slot_page": 0}
        _ask_slot(db, tenant, conversation, to_phone, ctx, page=0)
        return

    # --- More times pagination ---
    if list_id and list_id.startswith("slotmore_"):
        try:
            page = int(list_id.removeprefix("slotmore_"))
        except ValueError:
            page = 0
        if not ctx.get("selected_date") or not ctx.get("service_id"):
            send_services_menu(db, tenant, conversation, to_phone)
            return
        _ask_slot(db, tenant, conversation, to_phone, ctx, page=page)
        return

    # --- Time slot selected ---
    if list_id and list_id.startswith("slot_"):
        starts_at = _parse_slot_id(list_id, tz)
        if starts_at is None or not ctx.get("service_id"):
            send_services_menu(db, tenant, conversation, to_phone)
            return
        duration = int(ctx.get("duration_minutes") or 60)
        ends_at = starts_at + timedelta(minutes=duration)
        busy = _busy_bookings(
            db,
            tenant.id,
            starts_at.astimezone(timezone.utc) - timedelta(minutes=1),
            ends_at.astimezone(timezone.utc) + timedelta(minutes=1),
        )
        if _slot_conflicts(starts_at.astimezone(timezone.utc), ends_at.astimezone(timezone.utc), busy):
            body = "Sorry, that slot was just taken. Please pick another time."
            _try_send(
                db,
                conversation,
                body_for_inbox=body,
                send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
            )
            if ctx.get("selected_date"):
                _ask_slot(db, tenant, conversation, to_phone, ctx, page=int(ctx.get("slot_page") or 0))
            return

        when_label = starts_at.strftime("%a %d %b · %I:%M %p").replace(" 0", " ")
        ctx = {
            **ctx,
            "starts_at": starts_at.isoformat(),
            "selected_date": starts_at.date().isoformat(),
            "when_label": when_label,
            "preferred_text": when_label,
        }
        _ask_confirm(db, tenant, conversation, to_phone, ctx)
        return

    # --- Confirm ---
    if state == "awaiting_confirm" and button_id == "confirm_yes":
        try:
            booking = _create_booking(db, tenant, conversation, ctx)
        except ValueError:
            body = "Sorry, that slot was just taken. Please pick another time."
            _try_send(
                db,
                conversation,
                body_for_inbox=body,
                send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
            )
            if ctx.get("selected_date"):
                _ask_slot(db, tenant, conversation, to_phone, ctx, page=int(ctx.get("slot_page") or 0))
            return

        when = ctx.get("when_label") or (
            booking.starts_at.astimezone(tz).strftime("%a %d %b · %I:%M %p").replace(" 0", " ")
            if booking.starts_at
            else "TBD"
        )
        due = amount_due(booking)
        _set_state(conversation, "idle", {})
        if due <= 0:
            mark_booking_paid(db, booking)
            db.flush()
            deliver_booking_receipt(db, booking, to_phone=to_phone, persist=True)
        else:
            pay_url = booking.payment_url or ""
            body = (
                f"Booked! ✅\n\n"
                f"Ref: #{booking.id}\n"
                f"Package: {ctx.get('service_name')}\n"
                f"When: {when}\n"
                f"Amount due: {booking.currency} {due}\n\n"
                f"Pay here to confirm your slot:\n{pay_url}\n\n"
                f"You'll get your receipt on WhatsApp after payment.\n"
                f"Type *menu* to book another."
            )
            _try_send(
                db,
                conversation,
                body_for_inbox=body,
                send_fn=lambda: send_text_message(
                    to_phone=to_phone,
                    body=body,
                    **_send_kwargs(tenant),
                    preview_url=True,
                ),
            )
        return

    # Restart / menu
    if (
        normalized in MENU_WORDS
        or state in {"idle", "choosing_service"}
        or (state in {"awaiting_date", "awaiting_slot", "awaiting_confirm"} and normalized in MENU_WORDS)
    ):
        # If user is mid-flow and sends free text that isn't menu, nudge them.
        if state in {"awaiting_date", "awaiting_slot", "awaiting_confirm"} and normalized not in MENU_WORDS:
            nudge = {
                "awaiting_date": "Please pick a date from the list, or type *menu* to restart.",
                "awaiting_slot": "Please pick a time from the list, or type *menu* to restart.",
                "awaiting_confirm": "Tap *Confirm* or *Cancel*, or type *menu* to restart.",
            }[state]
            _try_send(
                db,
                conversation,
                body_for_inbox=nudge,
                send_fn=lambda: send_text_message(to_phone=to_phone, body=nudge, **_send_kwargs(tenant)),
            )
            return
        send_services_menu(db, tenant, conversation, to_phone)
        return

    # Mid-flow free text nudge when not caught above
    if state == "awaiting_date":
        body = "Please pick a date from the list above, or type *menu* to restart."
        _try_send(
            db,
            conversation,
            body_for_inbox=body,
            send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
        )
        return
    if state == "awaiting_slot":
        body = "Please pick a time slot from the list above, or type *menu* to restart."
        _try_send(
            db,
            conversation,
            body_for_inbox=body,
            send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
        )
        return
    if state == "awaiting_confirm":
        body = "Tap *Confirm* or *Cancel*, or type *menu* to restart."
        _try_send(
            db,
            conversation,
            body_for_inbox=body,
            send_fn=lambda: send_text_message(to_phone=to_phone, body=body, **_send_kwargs(tenant)),
        )
        return

    _try_send(
        db,
        conversation,
        body_for_inbox="Type menu to browse packages.",
        send_fn=lambda: send_text_message(
            to_phone=to_phone,
            body="Type *menu* to browse packages, or *cancel* to reset.",
            **_send_kwargs(tenant),
        ),
    )
