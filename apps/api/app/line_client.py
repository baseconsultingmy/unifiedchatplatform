"""LINE Messaging API client (push / reply)."""

from __future__ import annotations

from typing import Any

import httpx

API_BASE = "https://api.line.me/v2/bot"


class LineSendError(Exception):
    def __init__(self, message: str, status_code: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


def _headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def text_message(body: str) -> dict[str, Any]:
    return {"type": "text", "text": (body or "")[:5000]}


def buttons_template_message(
    *,
    alt_text: str,
    text: str,
    actions: list[dict[str, Any]],
    title: str | None = None,
) -> dict[str, Any]:
    """Build a buttons template (max 4 actions)."""
    template: dict[str, Any] = {
        "type": "buttons",
        "text": (text or "")[:160],
        "actions": actions[:4],
    }
    if title:
        template["title"] = title[:40]
    return {
        "type": "template",
        "altText": (alt_text or text or "Message")[:400],
        "template": template,
    }


def _post_messages(
    *,
    access_token: str,
    path: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    with httpx.Client(timeout=30.0) as client:
        res = client.post(f"{API_BASE}{path}", headers=_headers(access_token), json=payload)
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = data.get("message") or res.text or "LINE send failed"
        raise LineSendError(str(msg), status_code=res.status_code, payload=data)
    return data


def reply_messages(
    *,
    access_token: str,
    reply_token: str | None,
    to_user_id: str | None,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reply when reply_token is fresh; otherwise push to the user."""
    if not access_token:
        raise LineSendError("LINE channel access token is not configured")
    msgs = (messages or [])[:5]
    if not msgs:
        raise LineSendError("No messages to send")

    if reply_token:
        try:
            return _post_messages(
                access_token=access_token,
                path="/message/reply",
                payload={"replyToken": reply_token, "messages": msgs},
            )
        except LineSendError:
            # Reply tokens expire quickly; fall back to push.
            if not to_user_id:
                raise

    if not to_user_id:
        raise LineSendError("LINE user id is missing")
    return _post_messages(
        access_token=access_token,
        path="/message/push",
        payload={"to": to_user_id, "messages": msgs},
    )


def push_text_message(*, access_token: str, to_user_id: str, body: str) -> dict[str, Any]:
    return reply_messages(
        access_token=access_token,
        reply_token=None,
        to_user_id=to_user_id,
        messages=[text_message(body)],
    )


def reply_text_message(*, access_token: str, reply_token: str, body: str) -> dict[str, Any]:
    return reply_messages(
        access_token=access_token,
        reply_token=reply_token,
        to_user_id=None,
        messages=[text_message(body)],
    )


def get_profile(*, access_token: str, user_id: str) -> dict[str, Any]:
    if not access_token or not user_id:
        return {}
    with httpx.Client(timeout=20.0) as client:
        res = client.get(f"{API_BASE}/profile/{user_id}", headers=_headers(access_token))
    if res.status_code >= 400:
        return {}
    return res.json() if res.content else {}


def get_profile_with_user_token(*, user_access_token: str) -> dict[str, Any]:
    """Resolve LIFF / Login user profile via user OAuth access token."""
    if not user_access_token:
        return {}
    with httpx.Client(timeout=20.0) as client:
        res = client.get(
            "https://api.line.me/v2/profile",
            headers={"Authorization": f"Bearer {user_access_token}"},
        )
    if res.status_code >= 400:
        return {}
    return res.json() if res.content else {}
