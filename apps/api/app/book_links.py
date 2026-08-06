from __future__ import annotations

import hashlib
import hmac
from urllib.parse import quote

from app.config import settings
from app.models import Tenant


def book_sig(slug: str, identity: str) -> str:
    raw = f"{slug}:{identity}".encode()
    return hmac.new(settings.jwt_secret.encode(), raw, hashlib.sha256).hexdigest()[:32]


def verify_book_sig(slug: str, identity: str, sig: str | None) -> bool:
    if not identity or not sig:
        return False
    return hmac.compare_digest(book_sig(slug, identity), sig)


def booking_url(tenant: Tenant, phone: str) -> str:
    base = settings.public_api_base.rstrip("/")
    phone_digits = "".join(ch for ch in phone if ch.isdigit())
    sig = book_sig(tenant.slug, phone_digits)
    return f"{base}/book/{tenant.slug}?wa={quote(phone_digits)}&sig={sig}"


def line_web_book_url(tenant: Tenant, line_user_id: str) -> str:
    """Mobile web booking page keyed by LINE user id (works outside LIFF too)."""
    base = settings.public_api_base.rstrip("/")
    uid = (line_user_id or "").strip()
    sig = book_sig(tenant.slug, uid)
    return f"{base}/book/{tenant.slug}?line={quote(uid)}&sig={sig}"


def line_liff_url(tenant: Tenant, line_user_id: str) -> str | None:
    """LIFF deep link if a LIFF ID is configured (platform or tenant)."""
    liff_id = (getattr(tenant, "line_liff_id", None) or settings.line_liff_id or "").strip()
    if not liff_id:
        return None
    uid = (line_user_id or "").strip()
    sig = book_sig(tenant.slug, uid)
    # LIFF endpoint should be registered as {public_api_base}/liff/{slug}
    return f"https://liff.line.me/{liff_id}?line={quote(uid)}&sig={sig}"
