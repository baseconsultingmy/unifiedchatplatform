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


def push_text_message(*, access_token: str, to_user_id: str, body: str) -> dict[str, Any]:
    if not access_token:
        raise LineSendError("LINE channel access token is not configured")
    if not to_user_id:
        raise LineSendError("LINE user id is missing")
    payload = {
        "to": to_user_id,
        "messages": [{"type": "text", "text": body[:5000]}],
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.post(f"{API_BASE}/message/push", headers=_headers(access_token), json=payload)
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = data.get("message") or res.text or "LINE push failed"
        raise LineSendError(str(msg), status_code=res.status_code, payload=data)
    return data


def reply_text_message(*, access_token: str, reply_token: str, body: str) -> dict[str, Any]:
    if not access_token:
        raise LineSendError("LINE channel access token is not configured")
    payload = {
        "replyToken": reply_token,
        "messages": [{"type": "text", "text": body[:5000]}],
    }
    with httpx.Client(timeout=30.0) as client:
        res = client.post(f"{API_BASE}/message/reply", headers=_headers(access_token), json=payload)
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = data.get("message") or res.text or "LINE reply failed"
        raise LineSendError(str(msg), status_code=res.status_code, payload=data)
    return data


def get_profile(*, access_token: str, user_id: str) -> dict[str, Any]:
    if not access_token or not user_id:
        return {}
    with httpx.Client(timeout=20.0) as client:
        res = client.get(f"{API_BASE}/profile/{user_id}", headers=_headers(access_token))
    if res.status_code >= 400:
        return {}
    return res.json() if res.content else {}
