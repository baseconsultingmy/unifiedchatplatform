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
    preview_url: bool = False,
) -> dict:
    return _post_message(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "text",
            "text": {"preview_url": preview_url, "body": body},
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


def send_cta_url(
    *,
    to_phone: str,
    body: str,
    display_text: str,
    url: str,
    header: str | None = None,
    footer: str | None = None,
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    """Single-tap CTA that opens a URL (e.g. payment) inside WhatsApp."""
    interactive: dict[str, Any] = {
        "type": "cta_url",
        "body": {"text": body},
        "action": {
            "name": "cta_url",
            "parameters": {
                "display_text": display_text[:20],
                "url": url,
            },
        },
    }
    if header:
        interactive["header"] = {"type": "text", "text": header[:60]}
    if footer:
        interactive["footer"] = {"text": footer[:60]}
    return _post_message(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "interactive",
            "interactive": interactive,
        },
        phone_number_id=phone_number_id,
        access_token=access_token,
    )


def send_flow(
    *,
    to_phone: str,
    body: str,
    flow_id: str,
    flow_token: str,
    flow_cta: str = "Book",
    header: str | None = None,
    footer: str | None = None,
    draft: bool = False,
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    """Open a native WhatsApp Flow (in-chat multi-screen form)."""
    parameters: dict[str, Any] = {
        "flow_message_version": "3",
        "flow_token": flow_token,
        "flow_id": str(flow_id),
        "flow_cta": flow_cta[:30],
        "flow_action": "data_exchange",
    }
    if draft:
        parameters["mode"] = "draft"
    interactive: dict[str, Any] = {
        "type": "flow",
        "body": {"text": body},
        "action": {
            "name": "flow",
            "parameters": parameters,
        },
    }
    if header:
        interactive["header"] = {"type": "text", "text": header[:60]}
    if footer:
        interactive["footer"] = {"text": footer[:60]}
    return _post_message(
        {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_phone,
            "type": "interactive",
            "interactive": interactive,
        },
        phone_number_id=phone_number_id,
        access_token=access_token,
    )


def send_list_message(
    *,
    to_phone: str,
    body: str,
    button_label: str,
    section_title: str,
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
                            "title": section_title[:24],
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


def send_service_list(
    *,
    to_phone: str,
    body: str,
    button_label: str,
    rows: list[dict[str, str]],
    phone_number_id: str | None = None,
    access_token: str | None = None,
) -> dict:
    """Backward-compatible alias for package/service lists."""
    return send_list_message(
        to_phone=to_phone,
        body=body,
        button_label=button_label,
        section_title="Packages",
        rows=rows,
        phone_number_id=phone_number_id,
        access_token=access_token,
    )
