"""WhatsApp Flows data-exchange endpoint (encrypted).

Meta posts encrypted payloads here while the customer fills the in-chat Flow.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.flow_booking import decode_flow_token, next_flow_screen
from app.flow_crypto import (
    FlowCryptoError,
    decrypt_flow_request,
    encrypt_flow_response,
    is_flow_crypto_configured,
)
from app.models import Tenant

logger = logging.getLogger("baseapp.flows")

router = APIRouter(prefix="/v1/webhooks/whatsapp", tags=["whatsapp-flows"])


def _tenant_from_token(db: Session, flow_token: str) -> Tenant | None:
    data = decode_flow_token(flow_token)
    tid = data.get("tenant_id")
    if tid is None:
        return None
    try:
        return db.get(Tenant, int(tid))
    except (TypeError, ValueError):
        return None


@router.get("/flows")
def flows_health() -> dict[str, str]:
    settings = get_settings()
    ready = is_flow_crypto_configured(settings.wa_flow_private_key)
    return {"status": "ok", "flows": "ready" if ready else "crypto_missing"}


@router.post("/flows")
async def flows_data_exchange(request: Request, db: Session = Depends(get_db)) -> Response:
    settings = get_settings()
    raw = await request.body()
    try:
        body = json.loads(raw.decode("utf-8") if raw else "{}")
    except json.JSONDecodeError:
        return Response(
            content='{"error":"invalid_json"}',
            status_code=400,
            media_type="application/json",
        )

    # Unencrypted health check (some Meta setups send this first).
    if body.get("action") == "ping" and "encrypted_flow_data" not in body:
        return Response(
            content=json.dumps({"data": {"status": "active"}}),
            media_type="application/json",
        )

    if not is_flow_crypto_configured(settings.wa_flow_private_key):
        logger.error("WA_FLOW_PRIVATE_KEY not configured")
        return Response(
            content='{"error":"crypto_not_configured"}',
            status_code=503,
            media_type="application/json",
        )

    try:
        decrypted, aes_key, iv = decrypt_flow_request(
            body,
            private_key_pem=settings.wa_flow_private_key,
            passphrase=settings.wa_flow_private_key_password or None,
        )
    except FlowCryptoError as exc:
        logger.exception("Flow decrypt failed")
        return Response(
            content=json.dumps({"error": str(exc)}),
            status_code=exc.status_code,
            media_type="application/json",
        )
    except Exception:
        logger.exception("Flow decrypt failed")
        return Response(
            content='{"error":"decrypt_failed"}',
            status_code=421,
            media_type="application/json",
        )

    action = str(decrypted.get("action") or "")
    flow_token = str(decrypted.get("flow_token") or "")
    version = str(decrypted.get("version") or "3.0")
    screen = str(decrypted.get("screen") or "")
    logger.info("flow action=%s screen=%s token_len=%s", action, screen, len(flow_token))

    if action == "ping" or (
        isinstance(decrypted.get("data"), dict) and decrypted["data"].get("status") == "active"
    ):
        clear: dict[str, Any] = {"version": version, "data": {"status": "active"}}
    else:
        tenant = _tenant_from_token(db, flow_token)
        if tenant is None:
            clear = {
                "version": version,
                "screen": "CONFIRM",
                "data": {
                    "package_id": "",
                    "package_name": "Unavailable",
                    "date_id": "",
                    "date_label": "",
                    "slot_id": "",
                    "slot_label": "",
                    "price_label": "",
                    "summary": "Session expired. Close and tap Book again from WhatsApp.",
                },
            }
        else:
            clear = next_flow_screen(db, tenant, decrypted)

    try:
        encrypted = encrypt_flow_response(clear, aes_key=aes_key, initial_vector=iv)
    except Exception:
        logger.exception("Flow encrypt failed")
        return Response(
            content='{"error":"encrypt_failed"}',
            status_code=500,
            media_type="application/json",
        )

    return Response(content=encrypted, media_type="text/plain")
