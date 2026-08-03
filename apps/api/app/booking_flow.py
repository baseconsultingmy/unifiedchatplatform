from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import (
    Conversation,
    Message,
    MessageDirection,
    Tenant,
)
from app.book_links import booking_url
from app.whatsapp_client import WhatsAppSendError, send_cta_url, send_text_message
from app.whatsapp_creds import resolve_whatsapp_credentials

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


def send_booking_window(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    """
    One WhatsApp message → one booking window.

    Package, date, and time are chosen in a single hosted sheet.
    Dates with zero open slots and taken times are never selectable.
    """
    url = booking_url(tenant, to_phone)
    body = (
        f"Welcome to *{tenant.name}*!\n\n"
        "Tap below to book in one window:\n"
        "package → date → time → confirm & pay.\n\n"
        "Only open dates and times are shown — sold-out slots stay hidden."
    )
    _set_state(conversation, "awaiting_web_book", {"book_url": url})
    _try_send(
        db,
        conversation,
        body_for_inbox=body + f"\n{url}",
        send_fn=lambda: send_cta_url(
            to_phone=to_phone,
            header="Book appointment",
            body=body,
            display_text="Book now",
            url=url,
            footer="BaseApp",
            **_send_kwargs(tenant),
        ),
    )


# Backwards-compatible alias used by older call sites / docs.
def send_services_menu(
    db: Session,
    tenant: Tenant,
    conversation: Conversation,
    to_phone: str,
) -> None:
    send_booking_window(db, tenant, conversation, to_phone)


def handle_inbound_message(
    db: Session,
    *,
    tenant: Tenant,
    conversation: Conversation,
    msg: dict,
) -> None:
    """WhatsApp entrypoint: open the single booking window (no multi-message lists)."""
    to_phone = conversation.external_thread_id
    msg_type = msg.get("type")
    text = ""
    button_id = None

    if msg_type == "text":
        text = ((msg.get("text") or {}).get("body") or "").strip()
    elif msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        if interactive.get("type") == "button_reply":
            button_id = (interactive.get("button_reply") or {}).get("id")
            text = (interactive.get("button_reply") or {}).get("title") or ""
        elif interactive.get("type") == "list_reply":
            # Legacy mid-flow list taps → restart into the single booking window.
            text = "menu"
        elif interactive.get("type") == "nfm_reply":
            # Future WhatsApp Flows completion — treat as booking restart for now.
            text = "menu"
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
        "awaiting_datetime",
    }:
        send_booking_window(db, tenant, conversation, to_phone)
        return

    _try_send(
        db,
        conversation,
        body_for_inbox="Type menu to book.",
        send_fn=lambda: send_text_message(
            to_phone=to_phone,
            body="Type *menu* or *book* to open the booking window.",
            **_send_kwargs(tenant),
        ),
    )
