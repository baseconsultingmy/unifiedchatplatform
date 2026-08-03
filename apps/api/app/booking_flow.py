from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

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
from app.payments import attach_payment_link
from app.whatsapp_client import (
    WhatsAppSendError,
    send_reply_buttons,
    send_service_list,
    send_text_message,
)

MENU_WORDS = {"hi", "hello", "menu", "book", "start", "help", "services", "hola"}
CANCEL_WORDS = {"cancel", "stop", "reset"}


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


def _phone_id(tenant: Tenant) -> str | None:
    return tenant.wa_phone_number_id


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


def _active_services(db: Session, tenant_id: int) -> list[Service]:
    return (
        db.query(Service)
        .filter(Service.tenant_id == tenant_id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .all()
    )


def send_services_menu(db: Session, tenant: Tenant, conversation: Conversation, to_phone: str) -> None:
    services = _active_services(db, tenant.id)
    if not services:
        result = send_text_message(
            to_phone=to_phone,
            body=(
                f"Welcome to {tenant.name}!\n\n"
                "No services are published yet. Please message us again later or chat with our team."
            ),
            phone_number_id=_phone_id(tenant),
        )
        _store_outbound(db, conversation, "Welcome — no services published yet.", result)
        _set_state(conversation, "idle", {})
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
        "Choose a service to book. You can type *menu* anytime to restart."
    )
    result = send_service_list(
        to_phone=to_phone,
        body=body,
        button_label="View services",
        rows=rows,
        phone_number_id=_phone_id(tenant),
    )
    _store_outbound(db, conversation, body + "\n[service list sent]", result)
    _set_state(conversation, "choosing_service", {})


def _parse_datetime(text: str) -> datetime | None:
    raw = text.strip()
    lowered = raw.lower()
    now = datetime.now(timezone.utc)

    if lowered in {"today", "tonight"}:
        return now.replace(hour=15, minute=0, second=0, microsecond=0)
    if lowered in {"tomorrow"}:
        dt = now + timedelta(days=1)
        return dt.replace(hour=15, minute=0, second=0, microsecond=0)

    for fmt in (
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H.%M",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M",
        "%d/%m/%Y %I:%M %p",
        "%d/%m/%Y",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if fmt in {"%d/%m/%Y", "%Y-%m-%d"}:
                dt = dt.replace(hour=15, minute=0)
            return dt
        except ValueError:
            continue
    return None


def _ask_datetime(db: Session, tenant: Tenant, conversation: Conversation, to_phone: str, service: Service) -> None:
    body = (
        f"*{service.name}* selected ({service.duration_minutes} min, "
        f"{service.currency} {service.price_amount}).\n\n"
        "When would you like to come in?\n"
        "Reply with a date/time, e.g.\n"
        "• tomorrow\n"
        "• 05/08/2026 15:00\n"
        "• 2026-08-05 15:00"
    )
    result = send_text_message(to_phone=to_phone, body=body, phone_number_id=_phone_id(tenant))
    _store_outbound(db, conversation, body, result)
    _set_state(
        conversation,
        "awaiting_datetime",
        {
            "service_id": service.id,
            "service_name": service.name,
            "amount": str(service.price_amount),
            "currency": service.currency,
            "deposit_amount": str(service.deposit_amount),
            "duration_minutes": service.duration_minutes,
        },
    )


def _ask_confirm(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    ctx: dict,
    preferred_text: str,
    starts_at: datetime | None,
) -> None:
    when_label = starts_at.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M UTC") if starts_at else preferred_text
    body = (
        "Please confirm your booking:\n\n"
        f"• Service: {ctx.get('service_name')}\n"
        f"• When: {when_label}\n"
        f"• Price: {ctx.get('currency')} {ctx.get('amount')}\n"
    )
    deposit = Decimal(str(ctx.get("deposit_amount") or "0"))
    if deposit > 0:
        body += f"• Deposit due later: {ctx.get('currency')} {deposit}\n"
    body += "\nConfirm?"

    result = send_reply_buttons(
        to_phone=to_phone,
        body=body,
        buttons=[
            {"id": "confirm_yes", "title": "Confirm"},
            {"id": "confirm_no", "title": "Cancel"},
        ],
        phone_number_id=_phone_id(tenant),
    )
    _store_outbound(db, conversation, body + "\n[Confirm/Cancel buttons]", result)
    ctx = {
        **ctx,
        "preferred_text": preferred_text,
        "starts_at": starts_at.isoformat() if starts_at else None,
    }
    _set_state(conversation, "awaiting_confirm", ctx)


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
    if starts_at and service:
        ends_at = starts_at + timedelta(minutes=int(service.duration_minutes or 60))

    amount = Decimal(str(ctx.get("amount") or "0"))
    deposit = Decimal(str(ctx.get("deposit_amount") or "0"))
    if service is not None and deposit <= 0:
        deposit = Decimal(str(service.deposit_amount or 0))
    notes = ctx.get("preferred_text")
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
        notes=notes,
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
    """Drive booking chatbot after an inbound WhatsApp message is stored."""
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
        # Ignore status/reactions/etc for flow
        return

    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    state = conversation.flow_state or "idle"

    try:
        if normalized in CANCEL_WORDS or button_id == "confirm_no":
            result = send_text_message(
                to_phone=to_phone,
                body="Cancelled. Type *menu* to see services again.",
                phone_number_id=_phone_id(tenant),
            )
            _store_outbound(db, conversation, "Cancelled. Type menu to restart.", result)
            _set_state(conversation, "idle", {})
            return

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
                result = send_text_message(
                    to_phone=to_phone,
                    body="That service is unavailable. Type *menu* to choose again.",
                    phone_number_id=_phone_id(tenant),
                )
                _store_outbound(db, conversation, "Service unavailable.", result)
                _set_state(conversation, "idle", {})
                return
            _ask_datetime(db, tenant, conversation, to_phone, service)
            return

        if state == "awaiting_datetime" and text and normalized not in MENU_WORDS:
            ctx = _ctx(conversation)
            starts_at = _parse_datetime(text)
            _ask_confirm(db, tenant, conversation, to_phone, ctx, text, starts_at)
            return

        if state == "awaiting_confirm" and button_id == "confirm_yes":
            ctx = _ctx(conversation)
            booking = _create_booking(db, tenant, conversation, ctx)
            when = (
                booking.starts_at.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
                if booking.starts_at
                else (booking.notes or "TBD")
            )
            due = Decimal(str(booking.deposit_amount or 0))
            if due <= 0:
                due = Decimal(str(booking.amount or 0))
            pay_url = booking.payment_url or ""
            body = (
                f"Booked! ✅\n\n"
                f"Ref: #{booking.id}\n"
                f"Service: {ctx.get('service_name')}\n"
                f"When: {when}\n"
                f"Amount due: {booking.currency} {due}\n\n"
                f"Pay here to confirm your slot:\n{pay_url}\n\n"
                f"Type *menu* to book another."
            )
            result = send_text_message(
                to_phone=to_phone,
                body=body,
                phone_number_id=_phone_id(tenant),
                preview_url=True,
            )
            _store_outbound(db, conversation, body, result)
            _set_state(conversation, "idle", {})
            return

        if (
            normalized in MENU_WORDS
            or state in {"idle", "choosing_service"}
            or (state == "awaiting_confirm" and normalized in MENU_WORDS)
        ):
            send_services_menu(db, tenant, conversation, to_phone)
            return

        # Fallback help
        result = send_text_message(
            to_phone=to_phone,
            body="Type *menu* to browse services, or *cancel* to reset.",
            phone_number_id=_phone_id(tenant),
        )
        _store_outbound(db, conversation, "Type menu to browse services.", result)
    except WhatsAppSendError as exc:
        db.add(
            Message(
                conversation_id=conversation.id,
                direction=MessageDirection.outbound,
                body=f"[bot error] {exc}",
                raw_payload=json.dumps(exc.payload),
            )
        )
