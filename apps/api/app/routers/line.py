"""LINE Messaging API webhooks + status."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_vendor_user
from app.line_booking_flow import handle_line_inbound
from app.line_client import get_profile
from app.line_creds import apply_line_fields, refresh_line_status, resolve_line_credentials
from app.models import Channel, Conversation, Customer, Message, MessageDirection, Tenant, User
from app.schemas import LineStatusOut, LineUpdateIn

logger = logging.getLogger(__name__)

router = APIRouter(tags=["line"])


def _verify_signature(channel_secret: str, raw_body: bytes, signature: str | None) -> None:
    if not channel_secret:
        raise HTTPException(status_code=403, detail="LINE channel secret not configured")
    if not signature:
        raise HTTPException(status_code=403, detail="Missing X-Line-Signature")
    digest = hmac.new(channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=403, detail="Invalid LINE signature")


def _find_tenant_by_destination(db: Session, destination: str | None) -> Tenant | None:
    if not destination:
        return None
    return (
        db.query(Tenant)
        .filter(
            Tenant.line_channel_id == destination,
            Tenant.is_platform.is_(False),
            Tenant.is_active.is_(True),
        )
        .first()
    )


def _message_preview(msg: dict) -> str:
    msg_type = msg.get("type")
    if msg_type == "text":
        return (msg.get("text") or "")[:4000]
    if msg_type == "sticker":
        return "[sticker]"
    if msg_type == "image":
        return "[image]"
    if msg_type == "location":
        return "[location]"
    return f"[{msg_type or 'unknown'} message]"


def _line_status_payload(tenant: Tenant) -> LineStatusOut:
    refresh_line_status(tenant)
    base = settings.public_api_base.rstrip("/")
    liff_id = (getattr(tenant, "line_liff_id", None) or settings.line_liff_id or "").strip() or None
    return LineStatusOut(
        configured=bool(tenant.line_channel_id and tenant.line_channel_access_token),
        channel_id=tenant.line_channel_id,
        channel_secret_set=bool(tenant.line_channel_secret),
        access_token_set=bool(tenant.line_channel_access_token),
        liff_id=liff_id,
        liff_endpoint_url=f"{base}/liff/{tenant.slug}",
        webhook_status=tenant.line_webhook_status or "not_configured",
        connected_at=tenant.line_connected_at,
        webhook_url=f"{base}/v1/webhooks/line",
        notes=[
            "1. Create a Messaging API channel in LINE Developers.",
            "2. Paste Channel ID, Channel secret, and Channel access token here.",
            f"3. Set webhook URL to {base}/v1/webhooks/line and enable Use webhook.",
            "4. Chat booking: customers type menu / book for numbered packages.",
            f"5. Optional LIFF: create a LIFF app with endpoint {base}/liff/{tenant.slug}, paste LIFF ID here.",
        ],
    )


@router.get("/line/status", response_model=LineStatusOut)
def line_status(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> LineStatusOut:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    out = _line_status_payload(tenant)
    db.commit()
    return out


@router.patch("/line/settings", response_model=LineStatusOut)
def update_line_settings(
    payload: LineUpdateIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> LineStatusOut:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    apply_line_fields(tenant, payload.model_dump(exclude_unset=True))
    db.commit()
    return _line_status_payload(tenant)


@router.post("/webhooks/line")
async def line_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_line_signature: str | None = Header(default=None, alias="X-Line-Signature"),
) -> Response:
    raw = await request.body()
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON") from exc

    destination = str(body.get("destination") or "").strip() or None
    tenant = _find_tenant_by_destination(db, destination)

    # If destination unknown, try verify against any configured secret (multi-tenant).
    if tenant is None:
        tenants = (
            db.query(Tenant)
            .filter(
                Tenant.is_platform.is_(False),
                Tenant.is_active.is_(True),
                Tenant.line_channel_secret.isnot(None),
            )
            .all()
        )
        for candidate in tenants:
            secret = (candidate.line_channel_secret or "").strip()
            if not secret:
                continue
            digest = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).digest()
            expected = base64.b64encode(digest).decode("utf-8")
            if x_line_signature and hmac.compare_digest(expected, x_line_signature):
                tenant = candidate
                if destination and not tenant.line_channel_id:
                    tenant.line_channel_id = destination
                break
        if tenant is None:
            # Acknowledge empty/unknown to avoid LINE retries storms when misconfigured.
            logger.warning("LINE webhook: no tenant matched destination=%s", destination)
            return Response(status_code=200, content="OK")
    else:
        _, secret, _ = resolve_line_credentials(tenant)
        _verify_signature(secret or "", raw, x_line_signature)

    tenant.line_webhook_status = "verified"
    if tenant.line_connected_at is None:
        tenant.line_connected_at = datetime.now(timezone.utc)

    events = body.get("events") or []
    _, _, access_token = resolve_line_credentials(tenant)

    for event in events:
        event_type = event.get("type")
        source = event.get("source") or {}
        user_id = source.get("userId")
        if not user_id:
            continue

        customer = (
            db.query(Customer)
            .filter(Customer.tenant_id == tenant.id, Customer.phone == user_id)
            .first()
        )
        display_name = None
        if access_token and event_type in ("message", "follow"):
            profile = get_profile(access_token=access_token, user_id=user_id)
            display_name = profile.get("displayName")

        if customer is None:
            customer = Customer(
                tenant_id=tenant.id,
                name=display_name or "LINE User",
                phone=user_id,
            )
            db.add(customer)
            db.flush()
        elif display_name and (not customer.name or customer.name == "LINE User"):
            customer.name = display_name

        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.tenant_id == tenant.id,
                Conversation.channel == Channel.line,
                Conversation.external_thread_id == user_id,
            )
            .first()
        )
        now = datetime.now(timezone.utc)
        if conversation is None:
            conversation = Conversation(
                tenant_id=tenant.id,
                customer_id=customer.id,
                channel=Channel.line,
                external_thread_id=user_id,
                status="open",
                last_message_at=now,
                flow_state="idle",
            )
            db.add(conversation)
            db.flush()
        else:
            conversation.customer_id = customer.id
            conversation.status = "open"
            conversation.last_message_at = now

        preview = ""
        reply_token = event.get("replyToken")
        text_body = ""
        if event_type == "message":
            msg = event.get("message") or {}
            preview = _message_preview(msg)
            if msg.get("type") == "text":
                text_body = (msg.get("text") or "").strip()
        elif event_type == "follow":
            preview = "[followed LINE Official Account]"
        elif event_type == "unfollow":
            preview = "[unfollowed]"
            conversation.status = "closed"
        elif event_type == "postback":
            data = ((event.get("postback") or {}).get("data") or "").strip()
            preview = f"[postback] {data}"[:4000]
            text_body = data
        else:
            preview = f"[{event_type}]"

        if preview:
            db.add(
                Message(
                    conversation_id=conversation.id,
                    direction=MessageDirection.inbound,
                    body=preview,
                    raw_payload=json.dumps(event)[:20000],
                    external_message_id=(event.get("message") or {}).get("id")
                    or event.get("webhookEventId"),
                )
            )

        # Text booking bot / LIFF entry
        if event_type == "follow":
            try:
                handle_line_inbound(
                    db,
                    tenant=tenant,
                    conversation=conversation,
                    text="menu",
                    reply_token=reply_token,
                    is_follow=True,
                )
            except Exception:
                logger.exception("LINE follow booking handler failed")
        elif event_type in ("message", "postback") and text_body:
            try:
                handle_line_inbound(
                    db,
                    tenant=tenant,
                    conversation=conversation,
                    text=text_body,
                    reply_token=reply_token,
                    is_follow=False,
                )
            except Exception:
                logger.exception("LINE inbound booking handler failed")

    db.commit()
    return Response(status_code=200, content="OK")
