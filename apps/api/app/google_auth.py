"""Verify Google Identity Services ID tokens for merchant login/signup."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException

from app.config import settings


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str


def google_enabled() -> bool:
    return bool((settings.google_client_id or "").strip())


def verify_google_id_token(credential: str) -> GoogleIdentity:
    if not google_enabled():
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(status_code=503, detail="Google auth library missing") from exc

    try:
        info = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential") from exc

    if info.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google issuer")

    email = str(info.get("email") or "").strip().lower()
    sub = str(info.get("sub") or "").strip()
    if not email or not sub:
        raise HTTPException(status_code=400, detail="Google account is missing email")
    if not info.get("email_verified", False):
        raise HTTPException(status_code=400, detail="Google email is not verified")

    return GoogleIdentity(
        sub=sub,
        email=email,
        email_verified=True,
        name=str(info.get("name") or email.split("@")[0])[:120],
    )
