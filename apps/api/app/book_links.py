from __future__ import annotations

import hashlib
import hmac
from urllib.parse import quote

from app.config import settings
from app.models import Tenant


def book_sig(slug: str, phone: str) -> str:
    raw = f"{slug}:{phone}".encode()
    return hmac.new(settings.jwt_secret.encode(), raw, hashlib.sha256).hexdigest()[:32]


def verify_book_sig(slug: str, phone: str, sig: str | None) -> bool:
    if not phone or not sig:
        return False
    return hmac.compare_digest(book_sig(slug, phone), sig)


def booking_url(tenant: Tenant, phone: str) -> str:
    base = settings.public_api_base.rstrip("/")
    phone_digits = "".join(ch for ch in phone if ch.isdigit())
    sig = book_sig(tenant.slug, phone_digits)
    return f"{base}/book/{tenant.slug}?wa={quote(phone_digits)}&sig={sig}"
