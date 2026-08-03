from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.models import (
    Booking,
    Channel,
    Conversation,
    Message,
    MessageDirection,
)
from app.receipts import format_receipt_text, line_items_from_booking, normalize_phone
from app.whatsapp_client import WhatsAppSendError, send_text_message
from app.whatsapp_creds import resolve_whatsapp_credentials


def deliver_booking_receipt(
    db: Session,
    booking: Booking,
    *,
    to_phone: str | None = None,
    cash_received: Decimal | None = None,
    change: Decimal | None = None,
    payment_label: str | None = None,
    persist: bool = True,
) -> dict:
    """
    Send the shared receipt template over WhatsApp for a booking.

    Returns dict with keys: ok, body, sent_to, delivered_via (api|skipped|error), error?
    Always persists an outbound conversation message when persist=True and a phone is known.
    """
    if booking.tenant is None or booking.customer is None or booking.service is None:
        booking = (
            db.query(Booking)
            .options(
                joinedload(Booking.tenant),
                joinedload(Booking.customer),
                joinedload(Booking.service),
            )
            .filter(Booking.id == booking.id)
            .one()
        )

    phone = normalize_phone(to_phone) or normalize_phone(
        booking.customer.phone if booking.customer else None
    )
    body = format_receipt_text(
        booking=booking,
        line_items=line_items_from_booking(booking),
        cash_received=cash_received,
        change=change,
        payment_label=payment_label,
    )
    if not phone:
        return {
            "ok": False,
            "body": body,
            "sent_to": None,
            "delivered_via": "skipped",
            "error": "No customer WhatsApp number",
        }

    conversation = None
    if persist:
        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.tenant_id == booking.tenant_id,
                Conversation.channel == Channel.whatsapp,
                Conversation.external_thread_id == phone,
            )
            .first()
        )
        if conversation is None:
            conversation = Conversation(
                tenant_id=booking.tenant_id,
                customer_id=booking.customer_id,
                channel=Channel.whatsapp,
                external_thread_id=phone,
                status="open",
                flow_state="idle",
            )
            db.add(conversation)
            db.flush()
        elif booking.customer_id and not conversation.customer_id:
            conversation.customer_id = booking.customer_id

    access_token, phone_number_id = resolve_whatsapp_credentials(booking.tenant)
    result = None
    delivered_via = "api"
    error = None
    try:
        result = send_text_message(
            to_phone=phone,
            body=body,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
    except WhatsAppSendError as exc:
        delivered_via = "error"
        error = str(exc) or "WhatsApp send failed"

    if persist and conversation is not None:
        external_id = None
        if result:
            messages = result.get("messages") or []
            if messages:
                external_id = messages[0].get("id")
        now = datetime.now(timezone.utc)
        db.add(
            Message(
                conversation_id=conversation.id,
                direction=MessageDirection.outbound,
                body=body if not error else f"{body}\n\n[send failed: {error}]",
                raw_payload=json.dumps(result) if result else None,
                external_message_id=external_id,
            )
        )
        conversation.last_message_at = now
        conversation.status = "open"
        db.flush()

    return {
        "ok": error is None,
        "body": body,
        "sent_to": phone,
        "delivered_via": delivered_via,
        "error": error,
    }
