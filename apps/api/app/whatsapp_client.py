from __future__ import annotations

import httpx

from app.config import settings


class WhatsAppSendError(Exception):
    def __init__(self, message: str, status_code: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


def send_text_message(
    *,
    to_phone: str,
    body: str,
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    token = access_token or settings.meta_access_token
    number_id = phone_number_id or settings.meta_phone_number_id
    if not token:
        raise WhatsAppSendError("META_ACCESS_TOKEN is not configured")
    if not number_id:
        raise WhatsAppSendError("META_PHONE_NUMBER_ID is not configured")

    url = f"https://graph.facebook.com/v21.0/{number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_phone,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }
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
