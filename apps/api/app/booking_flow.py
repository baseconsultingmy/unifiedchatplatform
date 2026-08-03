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
from app.booking_reserve import ReserveError, reserve_whatsapp_booking
from app.config import settings
from app.flow_booking import encode_flow_token
from app.models import (
    Conversation,
    Message,
    MessageDirection,
    Service,
    Tenant,
)
from app.whatsapp_client import (
    WhatsAppSendError,
    send_cta_url,
    send_flow,
    send_list_message,
    send_reply_buttons,
    send_text_message,
)
from app.whatsapp_creds import resolve_whatsapp_credentials

logger = logging.getLogger("baseapp.booking_flow")

MENU_WORDS = {"hi", "hello", "menu", "book", "start", "help", "services", "hola", "packages"}
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


def _send_kwargs(tenant: Tenant) -> dict:
    token, phone_id = resolve_whatsapp_credentials(tenant)
    return {"access_token": token, "phone_number_id": phone_id}


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


def _active_services(db: Session, tenant: Tenant) -> list[Service]:
    return (
        db.query(Service)
        .filter(Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .all()
    )


def send_list_booking_menu(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    """In-chat package list (WhatsApp native lists — no browser)."""
    services = _active_services(db, tenant)
    if not services:
        _set_state(conversation, "idle", {})
        _try_send(
            db,
            conversation,
            body_for_inbox="No packages published.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body=f"*{tenant.name}* has no packages published yet. Please check back later.",
                **_send_kwargs(tenant),
            ),
        )
        return

    rows = []
    for s in services[:10]:
        deposit = Decimal(str(s.deposit_amount or 0))
        price = Decimal(str(s.price_amount or 0))
        desc = f"{s.duration_minutes} min · {s.currency} {price:.2f}"
        if deposit > 0:
            desc += f" · dep {deposit:.0f}"
        rows.append(
            {
                "id": f"svc:{s.id}",
                "title": (s.name or "Package")[:24],
                "description": desc[:72],
            }
        )

    body = (
        f"Welcome to *{tenant.name}*!\n\n"
        "Choose a package below. Next you’ll pick a date and time — "
        "only open slots are shown."
    )
    _set_state(conversation, "choosing_service", {})
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[package list]",
        send_fn=lambda: send_list_message(
            to_phone=to_phone,
            body=body,
            button_label="Packages",
            section_title="Packages",
            rows=rows,
            **_send_kwargs(tenant),
        ),
    )


def send_booking_flow(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    """Prefer native WhatsApp Flow; fall back to in-chat lists if Meta blocks Flows."""
    flow_id = (tenant.wa_flow_id or "").strip()
    if flow_id and settings.wa_flow_enabled:
        flow_token = encode_flow_token(
            tenant_id=tenant.id,
            phone=to_phone,
            conversation_id=conversation.id,
        )
        body = (
            f"Welcome to *{tenant.name}*!\n\n"
            "Tap *Book* to choose package, date, and time — all inside WhatsApp.\n"
            "Only open dates and times are shown."
        )
        _set_state(conversation, "awaiting_flow", {"flow_id": flow_id})
        result = _try_send(
            db,
            conversation,
            body_for_inbox=body + f"\n[flow:{flow_id}]",
            send_fn=lambda: send_flow(
                to_phone=to_phone,
                header="Book appointment",
                body=body,
                flow_id=flow_id,
                flow_token=flow_token,
                flow_cta="Book",
                footer="BaseApp",
                draft=bool(settings.wa_flow_draft_mode),
                **_send_kwargs(tenant),
            ),
        )
        if result is not None:
            return
        logger.warning(
            "Flow send failed for tenant=%s flow=%s — falling back to list booking",
            tenant.id,
            flow_id,
        )

    send_list_booking_menu(db, tenant, conversation, to_phone)


def send_booking_window(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    send_booking_flow(db, tenant, conversation, to_phone)


def send_services_menu(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    send_booking_flow(db, tenant, conversation, to_phone)


def _ask_dates(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    service: Service,
) -> None:
    tz = tenant_tz(tenant)
    today = datetime.now(tz).date()
    days = dates_with_availability(
        db,
        tenant,
        duration_minutes=int(service.duration_minutes or 60),
        days=14,
    )[:10]
    if not days:
        _try_send(
            db,
            conversation,
            body_for_inbox="No open dates.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="No open dates for that package right now. Type *menu* to pick another.",
                **_send_kwargs(tenant),
            ),
        )
        return

    rows = [
        {
            "id": f"date:{d.isoformat()}",
            "title": date_label(d, today)[:24],
            "description": d.strftime("%d %b %Y"),
        }
        for d in days
    ]
    body = f"*{service.name}*\nPick a date (only days with open slots):"
    _set_state(
        conversation,
        "awaiting_date",
        {"service_id": service.id, "service_name": service.name},
    )
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[date list]",
        send_fn=lambda: send_list_message(
            to_phone=to_phone,
            body=body,
            button_label="Dates",
            section_title="Dates",
            rows=rows,
            **_send_kwargs(tenant),
        ),
    )


def _ask_slots(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    service: Service,
    day: date,
) -> None:
    tz = tenant_tz(tenant)
    today = datetime.now(tz).date()
    slots = available_slots(
        db,
        tenant,
        day=day,
        duration_minutes=int(service.duration_minutes or 60),
    )[:10]
    if not slots:
        _try_send(
            db,
            conversation,
            body_for_inbox="No slots that day.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="No open times on that date. Type *menu* to start again.",
                **_send_kwargs(tenant),
            ),
        )
        return

    rows = [
        {
            "id": f"slot:{s.isoformat()}",
            "title": s.strftime("%I:%M %p").lstrip("0")[:24],
            "description": date_label(day, today),
        }
        for s in slots
    ]
    body = f"*{service.name}* · {date_label(day, today)}\nPick a time:"
    _set_state(
        conversation,
        "awaiting_slot",
        {
            "service_id": service.id,
            "service_name": service.name,
            "date_id": day.isoformat(),
        },
    )
    _try_send(
        db,
        conversation,
        body_for_inbox=body + "\n[slot list]",
        send_fn=lambda: send_list_message(
            to_phone=to_phone,
            body=body,
            button_label="Times",
            section_title="Times",
            rows=rows,
            **_send_kwargs(tenant),
        ),
    )


def _ask_confirm(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    service: Service,
    starts_at: datetime,
) -> None:
    tz = tenant_tz(tenant)
    when = starts_at.astimezone(tz).strftime("%a %d %b · %I:%M %p").replace(" 0", " ")
    deposit = Decimal(str(service.deposit_amount or 0))
    price = Decimal(str(service.price_amount or 0))
    money = (
        f"Deposit due: {service.currency} {deposit:.2f}"
        if deposit > 0
        else f"Total: {service.currency} {price:.2f}"
    )
    body = (
        f"Please confirm:\n\n"
        f"• Package: {service.name}\n"
        f"• When: {when}\n"
        f"• Duration: {service.duration_minutes} min\n"
        f"• {money}"
    )
    _set_state(
        conversation,
        "awaiting_confirm",
        {
            "service_id": service.id,
            "service_name": service.name,
            "slot_id": starts_at.isoformat(),
            "when": when,
        },
    )
    _try_send(
        db,
        conversation,
        body_for_inbox=body,
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


def _send_pay_cta(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    *,
    service_name: str,
    when: str,
    pay_url: str,
    currency: str,
    due: float,
) -> None:
    body = (
        f"*{service_name}* is held for you.\n"
        f"When: {when}\n"
        f"Amount due: {currency} {due:.2f}\n\n"
        "Tap below to pay and confirm."
    )
    _set_state(conversation, "awaiting_payment", {})
    if pay_url:
        _try_send(
            db,
            conversation,
            body_for_inbox=body + f"\n{pay_url}",
            send_fn=lambda: send_cta_url(
                to_phone=to_phone,
                header="Pay to confirm",
                body=body,
                display_text="Pay now",
                url=pay_url,
                footer="BaseApp",
                **_send_kwargs(tenant),
            ),
        )
    else:
        _try_send(
            db,
            conversation,
            body_for_inbox=body,
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body=body + "\n\n(Payment link unavailable — message the shop.)",
                **_send_kwargs(tenant),
            ),
        )


def _handle_nfm_reply(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    nfm: dict,
) -> None:
    raw = nfm.get("response_json") or "{}"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    package_id = payload.get("package_id")
    slot_id = payload.get("slot_id")
    if not package_id or not slot_id:
        _try_send(
            db,
            conversation,
            body_for_inbox="Flow completed without a slot.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="Something went wrong with that booking. Type *book* to try again.",
                **_send_kwargs(tenant),
            ),
        )
        return

    try:
        service_id = int(package_id)
        starts_at = datetime.fromisoformat(str(slot_id))
    except (TypeError, ValueError):
        _try_send(
            db,
            conversation,
            body_for_inbox="Invalid flow payload",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="That booking selection looked invalid. Type *book* to try again.",
                **_send_kwargs(tenant),
            ),
        )
        return

    try:
        booking, service = reserve_whatsapp_booking(
            db,
            tenant=tenant,
            phone=to_phone,
            service_id=service_id,
            starts_at=starts_at,
            external_ref_prefix="flow",
        )
    except ReserveError as exc:
        _try_send(
            db,
            conversation,
            body_for_inbox=f"Reserve failed: {exc}",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body=f"{exc}\n\nType *book* to pick another time.",
                **_send_kwargs(tenant),
            ),
        )
        return

    due = float(booking.deposit_amount or booking.amount or 0)
    _send_pay_cta(
        db,
        tenant,
        conversation,
        to_phone,
        service_name=service.name,
        when=booking.notes or "",
        pay_url=booking.payment_url or "",
        currency=booking.currency or "MYR",
        due=due,
    )


def handle_inbound_message(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    msg: dict,
) -> None:
    to_phone = conversation.external_thread_id
    msg_type = msg.get("type")
    text = ""
    button_id = None
    list_id = None

    if msg_type == "text":
        text = ((msg.get("text") or {}).get("body") or "").strip()
    elif msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        itype = interactive.get("type")
        if itype == "button_reply":
            button_id = (interactive.get("button_reply") or {}).get("id")
            text = (interactive.get("button_reply") or {}).get("title") or ""
        elif itype == "list_reply":
            list_id = (interactive.get("list_reply") or {}).get("id")
            text = (interactive.get("list_reply") or {}).get("title") or ""
        elif itype == "nfm_reply":
            _handle_nfm_reply(
                db,
                tenant=tenant,
                conversation=conversation,
                to_phone=to_phone,
                nfm=interactive.get("nfm_reply") or {},
            )
            return
        else:
            text = "menu"
    else:
        return

    normalized = re.sub(r"\s+", " ", text.lower()).strip()
    state = conversation.flow_state or "idle"
    ctx = _ctx(conversation)

    if normalized in CANCEL_WORDS or button_id == "confirm_no":
        _set_state(conversation, "idle", {})
        _try_send(
            db,
            conversation,
            body_for_inbox="Cancelled.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="Cancelled. Type *menu* or *book* when you’re ready again.",
                **_send_kwargs(tenant),
            ),
        )
        return

    # Package selected
    if list_id and str(list_id).startswith("svc:"):
        try:
            sid = int(str(list_id).split(":", 1)[1])
        except ValueError:
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        service = (
            db.query(Service)
            .filter(Service.id == sid, Service.tenant_id == tenant.id, Service.is_active.is_(True))
            .first()
        )
        if service is None:
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        _ask_dates(db, tenant, conversation, to_phone, service)
        return

    # Date selected
    if list_id and str(list_id).startswith("date:"):
        try:
            day = date.fromisoformat(str(list_id).split(":", 1)[1])
            sid = int(ctx.get("service_id"))
        except (ValueError, TypeError):
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        service = (
            db.query(Service)
            .filter(Service.id == sid, Service.tenant_id == tenant.id, Service.is_active.is_(True))
            .first()
        )
        if service is None:
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        _ask_slots(db, tenant, conversation, to_phone, service, day)
        return

    # Slot selected
    if list_id and str(list_id).startswith("slot:"):
        try:
            starts = datetime.fromisoformat(str(list_id).split(":", 1)[1])
            sid = int(ctx.get("service_id"))
        except (ValueError, TypeError):
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        service = (
            db.query(Service)
            .filter(Service.id == sid, Service.tenant_id == tenant.id, Service.is_active.is_(True))
            .first()
        )
        if service is None:
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        _ask_confirm(db, tenant, conversation, to_phone, service, starts)
        return

    # Confirm
    if state == "awaiting_confirm" and button_id == "confirm_yes":
        try:
            sid = int(ctx.get("service_id"))
            starts = datetime.fromisoformat(str(ctx.get("slot_id")))
        except (ValueError, TypeError):
            send_list_booking_menu(db, tenant, conversation, to_phone)
            return
        try:
            booking, service = reserve_whatsapp_booking(
                db,
                tenant=tenant,
                phone=to_phone,
                service_id=sid,
                starts_at=starts,
                external_ref_prefix="list",
            )
        except ReserveError as exc:
            _try_send(
                db,
                conversation,
                body_for_inbox=str(exc),
                send_fn=lambda: send_text_message(
                    to_phone=to_phone,
                    body=f"{exc}\n\nType *book* to pick another time.",
                    **_send_kwargs(tenant),
                ),
            )
            return
        due = float(booking.deposit_amount or booking.amount or 0)
        _send_pay_cta(
            db,
            tenant,
            conversation,
            to_phone,
            service_name=service.name,
            when=booking.notes or ctx.get("when") or "",
            pay_url=booking.payment_url or "",
            currency=booking.currency or "MYR",
            due=due,
        )
        return

    if normalized in MENU_WORDS or not normalized or state in {
        "idle",
        "choosing_service",
        "awaiting_date",
        "awaiting_slot",
        "awaiting_confirm",
        "awaiting_web_book",
        "awaiting_flow",
        "awaiting_payment",
        "awaiting_datetime",
    }:
        # Mid-flow free text → nudge, unless they said menu/book.
        if state in {"awaiting_date", "awaiting_slot", "awaiting_confirm"} and normalized not in MENU_WORDS:
            hints = {
                "awaiting_date": "Please pick a date from the list, or type *menu* to restart.",
                "awaiting_slot": "Please pick a time from the list, or type *menu* to restart.",
                "awaiting_confirm": "Tap *Confirm* or *Cancel*, or type *menu* to restart.",
            }
            _try_send(
                db,
                conversation,
                body_for_inbox=hints.get(state, "Type menu"),
                send_fn=lambda: send_text_message(
                    to_phone=to_phone,
                    body=hints.get(state, "Type *menu* to book."),
                    **_send_kwargs(tenant),
                ),
            )
            return
        send_booking_flow(db, tenant, conversation, to_phone)
        return

    _try_send(
        db,
        conversation,
        body_for_inbox="Type menu to book.",
        send_fn=lambda: send_text_message(
            to_phone=to_phone,
            body="Type *menu* or *book* to start booking inside WhatsApp.",
            **_send_kwargs(tenant),
        ),
    )
