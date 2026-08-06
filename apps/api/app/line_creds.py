"""Per-tenant LINE Messaging API credentials."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models import Tenant


def resolve_line_credentials(tenant: Tenant | None) -> tuple[str | None, str | None, str | None]:
    """Return (channel_id, channel_secret, access_token)."""
    if tenant is None:
        return None, None, None
    channel_id = (tenant.line_channel_id or "").strip() or None
    secret = (getattr(tenant, "line_channel_secret", None) or "").strip() or None
    token = (getattr(tenant, "line_channel_access_token", None) or "").strip() or None
    return channel_id, secret, token


def refresh_line_status(tenant: Tenant) -> None:
    has_id = bool((tenant.line_channel_id or "").strip())
    has_secret = bool((getattr(tenant, "line_channel_secret", None) or "").strip())
    has_token = bool((getattr(tenant, "line_channel_access_token", None) or "").strip())
    if has_id and has_secret and has_token:
        if getattr(tenant, "line_webhook_status", None) in (None, "", "not_configured", "error"):
            tenant.line_webhook_status = "configured"
        if getattr(tenant, "line_connected_at", None) is None:
            tenant.line_connected_at = datetime.now(timezone.utc)
    elif has_id:
        tenant.line_webhook_status = "pending"
    else:
        tenant.line_webhook_status = "not_configured"


def apply_line_fields(tenant: Tenant, data: dict) -> None:
    clear_token = bool(data.pop("clear_line_channel_access_token", False))
    clear_secret = bool(data.pop("clear_line_channel_secret", False))
    token = data.pop("line_channel_access_token", None)
    secret = data.pop("line_channel_secret", None)

    if "line_channel_id" in data:
        value = data.pop("line_channel_id")
        if isinstance(value, str):
            value = value.strip() or None
        tenant.line_channel_id = value

    if clear_secret:
        tenant.line_channel_secret = None
    elif isinstance(secret, str) and secret.strip():
        tenant.line_channel_secret = secret.strip()

    if clear_token:
        tenant.line_channel_access_token = None
    elif isinstance(token, str) and token.strip():
        tenant.line_channel_access_token = token.strip()

    refresh_line_status(tenant)
