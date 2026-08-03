from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Channel, Conversation, Customer, Message, MessageDirection, Tenant

router = APIRouter(prefix="/webhooks/whatsapp", tags=["whatsapp"])


def _verify_signature(raw_body: bytes, signature_header: str | None) -> None:
    if not settings.wa_app_secret:
        # Allow local/dev without signature until Meta app secret is configured.
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


def _default_tenant(db: Session) -> Tenant:
    tenant = db.query(Tenant).order_by(Tenant.id.asc()).first()
    if tenant is None:
        raise HTTPException(status_code=500, detail="No tenant configured")
    return tenant


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

    tenant = _default_tenant(db)
    stored = 0

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            messages = value.get("messages", [])
            contacts = {c.get("wa_id"): c for c in value.get("contacts", [])}

            for msg in messages:
                wa_from = msg.get("from")
                if not wa_from:
                    continue
                body = None
                if msg.get("type") == "text":
                    body = (msg.get("text") or {}).get("body")
                else:
                    body = f"[{msg.get('type', 'unknown')} message]"

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
                        body=body,
                        raw_payload=json.dumps(msg),
                        external_message_id=external_id,
                    )
                )
                stored += 1

    db.commit()
    return {"ok": True, "stored": stored}
