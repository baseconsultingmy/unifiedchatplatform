from __future__ import annotations

from datetime import datetime, timezone

from app.config import settings
from app.models import Tenant


def resolve_whatsapp_credentials(tenant: Tenant | None) -> tuple[str | None, str | None]:
    """Return (access_token, phone_number_id) preferring tenant overrides."""
    token = None
    phone_id = None
    if tenant is not None:
        token = (tenant.wa_access_token or "").strip() or None
        phone_id = (tenant.wa_phone_number_id or "").strip() or None
    token = token or (settings.meta_access_token or "").strip() or None
    phone_id = phone_id or (settings.meta_phone_number_id or "").strip() or None
    return token, phone_id


def resolve_verify_token(tenant: Tenant | None = None) -> str:
    if tenant and (tenant.wa_verify_token or "").strip():
        return tenant.wa_verify_token.strip()
    return settings.wa_verify_token


def refresh_whatsapp_status(tenant: Tenant) -> None:
    """Update derived webhook status from stored credentials."""
    has_phone = bool((tenant.wa_phone_number_id or "").strip())
    has_token = bool((tenant.wa_access_token or "").strip()) or bool(
        (settings.meta_access_token or "").strip()
    )
    if has_phone and has_token:
        if tenant.wa_webhook_status in (None, "", "not_configured", "error"):
            tenant.wa_webhook_status = "configured"
        if tenant.wa_connected_at is None:
            tenant.wa_connected_at = datetime.now(timezone.utc)
    elif has_phone:
        tenant.wa_webhook_status = "pending"
    else:
        tenant.wa_webhook_status = "not_configured"


def apply_whatsapp_fields(tenant: Tenant, data: dict) -> None:
    """Apply WhatsApp credential fields from an update payload (mutates data keys)."""
    clear_token = bool(data.pop("clear_wa_access_token", False))
    token = data.pop("wa_access_token", None)

    for key in (
        "wa_phone_number_id",
        "wa_business_account_id",
        "wa_display_phone",
        "wa_verify_token",
        "wa_webhook_status",
    ):
        if key in data:
            value = data.pop(key)
            if isinstance(value, str):
                value = value.strip() or None
            setattr(tenant, key, value)

    if clear_token:
        tenant.wa_access_token = None
    elif isinstance(token, str) and token.strip():
        tenant.wa_access_token = token.strip()

    refresh_whatsapp_status(tenant)
