"""Apply Grab Food fields from workspace / vendor update payloads."""

from __future__ import annotations

from app.models import Tenant


def apply_grab_fields(tenant: Tenant, data: dict) -> None:
    """Mutates tenant and pops grab-specific keys from data."""
    clear_grab_token = bool(data.pop("clear_grab_partner_token", False))
    grab_token = data.pop("grab_partner_token", None)
    if clear_grab_token:
        tenant.grab_partner_token = None
    elif grab_token is not None:
        tenant.grab_partner_token = str(grab_token).strip() or None

    if "grab_merchant_id" in data:
        mid = data.pop("grab_merchant_id")
        tenant.grab_merchant_id = (str(mid).strip() or None) if mid is not None else None
        if tenant.grab_merchant_id:
            if tenant.grab_sync_status in (
                None,
                "",
                "not_configured",
                "activation_pending",
            ):
                tenant.grab_sync_status = "ready"
        elif tenant.grab_sync_status not in ("published", "published_dry_run", "synced"):
            tenant.grab_sync_status = "not_configured"

    if "grab_markup_percent" in data and data["grab_markup_percent"] is not None:
        tenant.grab_markup_percent = float(data.pop("grab_markup_percent"))

    if "grab_sync_status" in data and data["grab_sync_status"] is not None:
        tenant.grab_sync_status = str(data.pop("grab_sync_status")).strip() or tenant.grab_sync_status

    if "grab_activation_url" in data:
        url = data.pop("grab_activation_url")
        tenant.grab_activation_url = (str(url).strip() or None) if url is not None else None
