from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.booking_reserve import ReserveError, reserve_whatsapp_booking
from app.config import settings
from app.flow_booking import encode_flow_token
from app.models import (
    Conversation,
    Message,
    MessageDirection,
    Tenant,
)
from app.whatsapp_client import (
    WhatsAppSendError,
    send_cta_url,
    send_flow,
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


def send_booking_flow(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    """Open the native WhatsApp booking Flow (package → date → time → confirm)."""
    flow_id = (tenant.wa_flow_id or "").strip()
    if not flow_id:
        body = (
            f"Welcome to *{tenant.name}*!\n\n"
            "In-chat booking is almost ready. The shop still needs to publish the "
            "WhatsApp booking Flow (Master Admin → Meta setup → Publish booking Flow).\n\n"
            "Type *menu* again after that."
        )
        _set_state(conversation, "idle", {})
        _try_send(
            db,
            conversation,
            body_for_inbox=body,
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body=body,
                **_send_kwargs(tenant),
            ),
        )
        return

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
    _try_send(
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


# Backwards-compatible names used by older call sites / docs.
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


def _handle_nfm_reply(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
    nfm: dict,
) -> None:
    """Customer completed the native Flow — hold slot and send pay link."""
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
            body_for_inbox="Flow completed without a slot — restart.",
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
        logger.info("flow reserve failed: %s", exc)
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

    pay_url = booking.payment_url or ""
    when = booking.notes or ""
    due = float(booking.deposit_amount or booking.amount or 0)
    currency = booking.currency or "MYR"
    body = (
        f"*{service.name}* is held for you.\n"
        f"When: {when}\n"
        f"Amount due: {currency} {due:.2f}\n\n"
        "Tap below to pay and confirm."
    )
    _set_state(conversation, "awaiting_payment", {"booking_id": booking.id})
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


def handle_inbound_message(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    msg: dict,
) -> None:
    """WhatsApp entrypoint: open native booking Flow; handle Flow completion."""
    to_phone = conversation.external_thread_id
    msg_type = msg.get("type")
    text = ""
    button_id = None

    if msg_type == "text":
        text = ((msg.get("text") or {}).get("body") or "").strip()
    elif msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        itype = interactive.get("type")
        if itype == "button_reply":
            button_id = (interactive.get("button_reply") or {}).get("id")
            text = (interactive.get("button_reply") or {}).get("title") or ""
        elif itype == "list_reply":
            text = "menu"
        elif itype == "nfm_reply":
            _handle_nfm_reply(
                db,
                tenant=tenant,
                conversation=conversation,
                to_phone=to_phone,
                nfm=interactive.get("nfm_reply") or {},
            )
            db.commit()
            return
        else:
            text = "menu"
    else:
        return

    normalized = re.sub(r"\s+", " ", text.lower()).strip()

    if normalized in CANCEL_WORDS or button_id == "confirm_no":
        _set_state(conversation, "idle", {})
        _try_send(
            db,
            conversation,
            body_for_inbox="Cancelled. Type menu to book again.",
            send_fn=lambda: send_text_message(
                to_phone=to_phone,
                body="Cancelled. Type *menu* or *book* when you’re ready again.",
                **_send_kwargs(tenant),
            ),
        )
        return

    if normalized in MENU_WORDS or not normalized or conversation.flow_state in {
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
        send_booking_flow(db, tenant, conversation, to_phone)
        return

    _try_send(
        db,
        conversation,
        body_for_inbox="Type menu to book.",
        send_fn=lambda: send_text_message(
            to_phone=to_phone,
            body="Type *menu* or *book* to open booking inside WhatsApp.",
            **_send_kwargs(tenant),
        ),
    )
