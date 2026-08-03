from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.booking_flow import handle_inbound_message
from app.config import settings
from app.db import get_db
from app.models import Channel, Conversation, Customer, Message, MessageDirection, Tenant

router = APIRouter(prefix="/webhooks/whatsapp", tags=["whatsapp"])


def _verify_signature(raw_body: bytes, signature_header: str | None) -> None:
    if not settings.wa_app_secret:
        return
    if not signature_header or not signature_header.startswith("sha256="):
        raise HTTPException(status_code=403, detail="Missing signature")
    expected = hmac.new(
        settings.wa_app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    received = signature_header.split("=", 1)[1]
    if not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=403, detail="Invalid signature")


def _resolve_tenant(db: Session, phone_number_id: str | None = None) -> Tenant:
    if phone_number_id:
        tenant = (
            db.query(Tenant)
            .filter(
                Tenant.wa_phone_number_id == phone_number_id,
                Tenant.is_platform.is_(False),
                Tenant.is_active.is_(True),
            )
            .first()
        )
        if tenant:
            return tenant

    tenant = (
        db.query(Tenant)
        .filter(Tenant.is_platform.is_(False), Tenant.is_active.is_(True))
        .order_by(Tenant.id.asc())
        .first()
    )
    if tenant is None:
        raise HTTPException(status_code=500, detail="No vendor tenant configured")
    return tenant


def _message_preview(msg: dict) -> str:
    msg_type = msg.get("type")
    if msg_type == "text":
        return (msg.get("text") or {}).get("body") or ""
    if msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        if interactive.get("type") == "list_reply":
            reply = interactive.get("list_reply") or {}
            return f"[selected] {reply.get('title') or reply.get('id')}"
        if interactive.get("type") == "button_reply":
            reply = interactive.get("button_reply") or {}
            return f"[button] {reply.get('title') or reply.get('id')}"
        return "[interactive]"
    return f"[{msg_type or 'unknown'} message]"


@router.get("")
def verify_webhook(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
) -> Response:
    if hub_mode == "subscribe" and hub_verify_token == settings.wa_verify_token and hub_challenge:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("")
async def receive_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_hub_signature_256: str | None = Header(default=None),
) -> dict:
    raw = await request.body()
    _verify_signature(raw, x_hub_signature_256)

    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    stored = 0
    flowed = 0

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            # Ignore status callbacks without messages.
            messages = value.get("messages", [])
            if not messages:
                continue

            metadata = value.get("metadata") or {}
            phone_number_id = metadata.get("phone_number_id")
            tenant = _resolve_tenant(db, phone_number_id)
            contacts = {c.get("wa_id"): c for c in value.get("contacts", [])}

            for msg in messages:
                wa_from = msg.get("from")
                if not wa_from:
                    continue

                contact = contacts.get(wa_from, {})
                profile_name = ((contact.get("profile") or {}).get("name")) if contact else None

                customer = (
                    db.query(Customer)
                    .filter(Customer.tenant_id == tenant.id, Customer.phone == wa_from)
                    .first()
                )
                if customer is None:
                    customer = Customer(tenant_id=tenant.id, phone=wa_from, name=profile_name)
                    db.add(customer)
                    db.flush()
                elif profile_name and not customer.name:
                    customer.name = profile_name

                conversation = (
                    db.query(Conversation)
                    .filter(
                        Conversation.tenant_id == tenant.id,
                        Conversation.channel == Channel.whatsapp,
                        Conversation.external_thread_id == wa_from,
                    )
                    .first()
                )
                if conversation is None:
                    conversation = Conversation(
                        tenant_id=tenant.id,
                        customer_id=customer.id,
                        channel=Channel.whatsapp,
                        external_thread_id=wa_from,
                        status="open",
                        flow_state="idle",
                    )
                    db.add(conversation)
                    db.flush()
                else:
                    conversation.customer_id = customer.id
                    conversation.status = "open"

                external_id = msg.get("id")
                if external_id:
                    exists = (
                        db.query(Message)
                        .filter(Message.external_message_id == external_id)
                        .first()
                    )
                    if exists:
                        continue

                now = datetime.now(timezone.utc)
                conversation.last_message_at = now
                db.add(
                    Message(
                        conversation_id=conversation.id,
                        direction=MessageDirection.inbound,
                        body=_message_preview(msg),
                        raw_payload=json.dumps(msg),
                        external_message_id=external_id,
                    )
                )
                stored += 1

                handle_inbound_message(
                    db,
                    tenant=tenant,
                    conversation=conversation,
                    msg=msg,
                )
                flowed += 1

    db.commit()
    return {"ok": True, "stored": stored, "flowed": flowed}
