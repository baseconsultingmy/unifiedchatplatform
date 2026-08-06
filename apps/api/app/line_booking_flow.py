"""LINE text booking bot + LIFF entry point.

Numbered text menus (package → date → time → confirm) with optional
LIFF / web booking button. Uses replyToken when available, else push.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.availability import (
    available_slots,
    date_label,
    dates_with_availability,
    tenant_tz,
)
from app.book_links import line_liff_url, line_web_book_url
from app.booking_reserve import ReserveError, reserve_channel_booking
from app.config import settings
from app.line_client import (
    LineSendError,
    buttons_template_message,
    reply_messages,
    text_message,
)
from app.line_creds import resolve_line_credentials
from app.models import Conversation, Message, MessageDirection, Service, Tenant

logger = logging.getLogger("baseapp.line_booking_flow")

MENU_WORDS = {"hi", "hello", "menu", "book", "start", "help", "services", "hola", "packages", "booking"}
CANCEL_WORDS = {"cancel", "stop", "reset", "0"}
LIFF_WORDS = {"liff", "app", "web", "browser", "open"}


def _ctx(conversation: Conversation) -> dict:
    if not conversation.flow_context:
        return {}
    try:
        return json.loads(conversation.flow_context)
    except json.JSONDecodeError:
        return {}


def _set_state(conversation: Conversation, state: str, data: dict | None = None) -> None:
    conversation.flow_state = state
    if data is not None:
        conversation.flow_context = json.dumps(data or {})


def _store_outbound(db: Session, conversation: Conversation, body: str, result: dict | None = None) -> None:
    conversation.last_message_at = datetime.now(timezone.utc)
    db.add(
        Message(
            conversation_id=conversation.id,
            direction=MessageDirection.outbound,
            body=body,
            raw_payload=json.dumps(result) if result else None,
        )
    )


def _send(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    *,
    reply_token: str | None,
    messages: list[dict],
    inbox: str,
) -> None:
    _, _, token = resolve_line_credentials(tenant)
    if not token:
        _store_outbound(db, conversation, f"{inbox}\n\n[LINE token missing]")
        return
    try:
        result = reply_messages(
            access_token=token,
            reply_token=reply_token,
            to_user_id=conversation.external_thread_id,
            messages=messages,
        )
        _store_outbound(db, conversation, inbox, result)
    except LineSendError as exc:
        _store_outbound(
            db,
            conversation,
            f"{inbox}\n\n[send failed: {exc}]",
            {"error": exc.payload or str(exc)},
        )


def _active_services(db: Session, tenant: Tenant) -> list[Service]:
    return (
        db.query(Service)
        .filter(Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .all()
    )


def send_line_menu(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    *,
    reply_token: str | None,
) -> None:
    services = _active_services(db, tenant)
    if not services:
        _send(
            db,
            tenant,
            conversation,
            reply_token=reply_token,
            messages=[text_message(f"{tenant.name} has no packages published yet.")],
            inbox="No packages published.",
        )
        _set_state(conversation, "idle", {})
        return

    lines = [f"Welcome to {tenant.name}!", "", "Choose a package (reply with the number):", ""]
    options = []
    for i, s in enumerate(services[:10], start=1):
        price = Decimal(str(s.price_amount or 0))
        lines.append(f"{i}. {s.name} — {s.duration_minutes} min · {s.currency} {price:.2f}")
        options.append({"n": i, "service_id": s.id})
    lines.extend(["", "Or type *app* to open the booking mini-app.", "Type *cancel* to stop."])
    body = "\n".join(lines)
    _set_state(conversation, "choosing_service", {"options": options})
    liff_url = line_liff_url(tenant, conversation.external_thread_id) or line_web_book_url(
        tenant, conversation.external_thread_id
    )
    messages = [text_message(body)]
    if liff_url:
        messages.append(
            buttons_template_message(
                alt_text="Open booking app",
                text="Prefer taps? Open the booking app:",
                actions=[{"type": "uri", "label": "Open booking", "uri": liff_url}],
            )
        )
    _send(db, tenant, conversation, reply_token=reply_token, messages=messages, inbox=body)


def _ask_dates(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    service: Service,
    *,
    reply_token: str | None,
) -> None:
    tz = tenant_tz(tenant)
    today = datetime.now(tz).date()
    days = dates_with_availability(
        db, tenant, duration_minutes=int(service.duration_minutes or 60), days=14
    )[:10]
    if not days:
        _send(
            db,
            tenant,
            conversation,
            reply_token=reply_token,
            messages=[text_message("No open dates for that package. Type *menu* to pick another.")],
            inbox="No open dates.",
        )
        return
    options = []
    lines = [f"{service.name}", "Pick a date (reply with the number):", ""]
    for i, d in enumerate(days, start=1):
        lines.append(f"{i}. {date_label(d, today)} — {d.strftime('%d %b %Y')}")
        options.append({"n": i, "date": d.isoformat()})
    lines.extend(["", "Type *menu* to restart."])
    body = "\n".join(lines)
    _set_state(
        conversation,
        "awaiting_date",
        {"service_id": service.id, "service_name": service.name, "options": options},
    )
    _send(db, tenant, conversation, reply_token=reply_token, messages=[text_message(body)], inbox=body)


def _ask_slots(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    service: Service,
    day: date,
    *,
    reply_token: str | None,
) -> None:
    slots = available_slots(
        db, tenant, day=day, duration_minutes=int(service.duration_minutes or 60)
    )[:10]
    if not slots:
        _send(
            db,
            tenant,
            conversation,
            reply_token=reply_token,
            messages=[text_message("No open times that day. Type *menu* to restart.")],
            inbox="No open slots.",
        )
        return
    options = []
    lines = [f"{service.name} · {day.strftime('%d %b')}", "Pick a time:", ""]
    for i, s in enumerate(slots, start=1):
        label = s.strftime("%I:%M %p").lstrip("0")
        lines.append(f"{i}. {label}")
        options.append({"n": i, "slot": s.isoformat()})
    lines.extend(["", "Type *menu* to restart."])
    body = "\n".join(lines)
    _set_state(
        conversation,
        "awaiting_slot",
        {
            "service_id": service.id,
            "service_name": service.name,
            "date": day.isoformat(),
            "options": options,
        },
    )
    _send(db, tenant, conversation, reply_token=reply_token, messages=[text_message(body)], inbox=body)


def _ask_confirm(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    service: Service,
    starts: datetime,
    *,
    reply_token: str | None,
) -> None:
    when = starts.astimezone(tenant_tz(tenant)).strftime("%a %d %b · %I:%M %p").replace(" 0", " ")
    price = Decimal(str(service.price_amount or 0))
    deposit = Decimal(str(service.deposit_amount or 0))
    due = deposit if deposit > 0 else price
    body = (
        f"Confirm booking?\n\n"
        f"• {service.name}\n"
        f"• {when}\n"
        f"• Due now: {service.currency} {due:.2f}\n\n"
        f"Reply *1* to confirm, *2* to cancel."
    )
    _set_state(
        conversation,
        "awaiting_confirm",
        {
            "service_id": service.id,
            "service_name": service.name,
            "slot_id": starts.isoformat(),
            "when": when,
        },
    )
    _send(db, tenant, conversation, reply_token=reply_token, messages=[text_message(body)], inbox=body)


def handle_line_inbound(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    text: str,
    reply_token: str | None = None,
    is_follow: bool = False,
) -> None:
    user_id = conversation.external_thread_id
    normalized = re.sub(r"\s+", " ", (text or "").lower()).strip()
    state = conversation.flow_state or "idle"
    ctx = _ctx(conversation)

    if is_follow or normalized in MENU_WORDS:
        send_line_menu(db, tenant, conversation, reply_token=reply_token)
        return

    if normalized in CANCEL_WORDS:
        _set_state(conversation, "idle", {})
        _send(
            db,
            tenant,
            conversation,
            reply_token=reply_token,
            messages=[text_message("Cancelled. Type *menu* or *book* when you’re ready.")],
            inbox="Cancelled.",
        )
        return

    if normalized in LIFF_WORDS:
        url = line_liff_url(tenant, user_id) or line_web_book_url(tenant, user_id)
        if not url:
            _send(
                db,
                tenant,
                conversation,
                reply_token=reply_token,
                messages=[text_message("Booking link unavailable. Type *menu* to book in chat.")],
                inbox="No LIFF/web URL",
            )
            return
        _send(
            db,
            tenant,
            conversation,
            reply_token=reply_token,
            messages=[
                buttons_template_message(
                    alt_text="Open booking",
                    text="Open the booking app:",
                    actions=[{"type": "uri", "label": "Open booking", "uri": url}],
                )
            ],
            inbox=f"Open booking: {url}",
        )
        return

    # Numeric choice
    choice = None
    if normalized.isdigit():
        choice = int(normalized)

    if state == "choosing_service" and choice:
        options = {int(o["n"]): o for o in (ctx.get("options") or [])}
        opt = options.get(choice)
        if not opt:
            send_line_menu(db, tenant, conversation, reply_token=reply_token)
            return
        service = (
            db.query(Service)
            .filter(
                Service.id == int(opt["service_id"]),
                Service.tenant_id == tenant.id,
                Service.is_active.is_(True),
            )
            .first()
        )
        if not service:
            send_line_menu(db, tenant, conversation, reply_token=reply_token)
            return
        _ask_dates(db, tenant, conversation, service, reply_token=reply_token)
        return

    if state == "awaiting_date" and choice:
        options = {int(o["n"]): o for o in (ctx.get("options") or [])}
        opt = options.get(choice)
        try:
            day = date.fromisoformat(str(opt["date"]))
            sid = int(ctx.get("service_id"))
        except (TypeError, ValueError, KeyError):
            send_line_menu(db, tenant, conversation, reply_token=reply_token)
            return
        service = (
            db.query(Service)
            .filter(Service.id == sid, Service.tenant_id == tenant.id, Service.is_active.is_(True))
            .first()
        )
        if not service:
            send_line_menu(db, tenant, conversation, reply_token=reply_token)
            return
        _ask_slots(db, tenant, conversation, service, day, reply_token=reply_token)
        return

    if state == "awaiting_slot" and choice:
        options = {int(o["n"]): o for o in (ctx.get("options") or [])}
        opt = options.get(choice)
        try:
            starts = datetime.fromisoformat(str(opt["slot"]))
            sid = int(ctx.get("service_id"))
        except (TypeError, ValueError, KeyError):
            send_line_menu(db, tenant, conversation, reply_token=reply_token)
            return
        service = (
            db.query(Service)
            .filter(Service.id == sid, Service.tenant_id == tenant.id, Service.is_active.is_(True))
            .first()
        )
        if not service:
            send_line_menu(db, tenant, conversation, reply_token=reply_token)
            return
        _ask_confirm(db, tenant, conversation, service, starts, reply_token=reply_token)
        return

    if state == "awaiting_confirm":
        if choice == 1 or normalized in {"yes", "y", "confirm", "ok"}:
            try:
                sid = int(ctx.get("service_id"))
                starts = datetime.fromisoformat(str(ctx.get("slot_id")))
            except (TypeError, ValueError):
                send_line_menu(db, tenant, conversation, reply_token=reply_token)
                return
            try:
                booking, service = reserve_channel_booking(
                    db,
                    tenant=tenant,
                    external_id=user_id,
                    channel="line",
                    service_id=sid,
                    starts_at=starts,
                    customer_name=None,
                    external_ref_prefix="line",
                )
            except ReserveError as exc:
                _send(
                    db,
                    tenant,
                    conversation,
                    reply_token=reply_token,
                    messages=[text_message(f"{exc}\n\nType *menu* to try another time.")],
                    inbox=str(exc),
                )
                return
            due = float(booking.deposit_amount or booking.amount or 0)
            pay_url = booking.payment_url or ""
            when = booking.notes or ctx.get("when") or ""
            body = (
                f"Reserved!\n\n"
                f"• {service.name}\n"
                f"• {when}\n"
                f"• Due: {booking.currency} {due:.2f}\n"
            )
            messages = [text_message(body)]
            if pay_url:
                messages.append(
                    buttons_template_message(
                        alt_text="Pay deposit",
                        text="Complete payment to confirm your booking:",
                        actions=[{"type": "uri", "label": "Pay now", "uri": pay_url}],
                    )
                )
                body += f"\nPay: {pay_url}"
            _set_state(conversation, "awaiting_payment", {"booking_id": booking.id})
            _send(db, tenant, conversation, reply_token=reply_token, messages=messages, inbox=body)
            return
        if choice == 2 or normalized in {"no", "n"}:
            _set_state(conversation, "idle", {})
            _send(
                db,
                tenant,
                conversation,
                reply_token=reply_token,
                messages=[text_message("Cancelled. Type *menu* to book again.")],
                inbox="Cancelled.",
            )
            return

    # Default: show menu
    send_line_menu(db, tenant, conversation, reply_token=reply_token)
