from __future__ import annotations

from typing import Any

import httpx

from app.config import settings


class WhatsAppSendError(Exception):
    def __init__(self, message: str, status_code: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


def _credentials(
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> tuple[str, str]:
    token = access_token or settings.meta_access_token
    number_id = phone_number_id or settings.meta_phone_number_id
    if not token:
        raise WhatsAppSendError("META_ACCESS_TOKEN is not configured")
    if not number_id:
        raise WhatsAppSendError("META_PHONE_NUMBER_ID is not configured")
    return token, number_id


def _post_message(
    payload: dict[str, Any],
    *,
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    token, number_id = _credentials(phone_number_id, access_token)
    url = f"https://graph.facebook.com/v21.0/{number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.post(url, headers=headers, json=payload)
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        err = (data.get("error") or {}).get("message") or res.text or "WhatsApp send failed"
        raise WhatsAppSendError(err, status_code=res.status_code, payload=data)
    return data


def send_text_message(
    *,
    to_phone: str,
    body: str,
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    return _post_message(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "text",
            "text": {"preview_url": False, "body": body},
        },
        phone_number_id=phone_number_id,
        access_token=access_token,
    )


def send_reply_buttons(
    *,
    to_phone: str,
    body: str,
    buttons: list[dict[str, str]],
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    """buttons: [{id, title}] max 3, title <= 20 chars."""
    return _post_message(
        {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {"type": "reply", "reply": {"id": b["id"], "title": b["title"][:20]}}
                        for b in buttons[:3]
                    ]
                },
            },
        },
        phone_number_id=phone_number_id,
        access_token=access_token,
    )


def send_service_list(
    *,
    to_phone: str,
    body: str,
    button_label: str,
    rows: list[dict[str, str]],
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    """rows: [{id, title, description}] max 10."""
    return _post_message(
        {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "body": {"text": body},
                "action": {
                    "button": button_label[:20],
                    "sections": [
                        {
                            "title": "Services",
                            "rows": [
                                {
                                    "id": r["id"][:200],
                                    "title": r["title"][:24],
                                    "description": (r.get("description") or "")[:72],
                                }
                                for r in rows[:10]
                            ],
                        }
                    ],
                },
            },
        },
        phone_number_id=phone_number_id,
        access_token=access_token,
    )
