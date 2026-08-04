"""Grab Food POS client (sandbox-ready).

Full partner activation still requires Grab Open Platform credentials.
When tokens are missing we run in dry-run mode so menu publish / order
flows can be tested end-to-end inside BaseApp.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

STG_API = "https://partner-api.grab.com/grabfood-sandbox"
PRD_API = "https://partner-api.grab.com/grabfood"
STG_AUTH = "https://api.grab.com/grabid/v1/oauth2/token"
PRD_AUTH = "https://api.grab.com/grabid/v1/oauth2/token"


def grab_api_base() -> str:
    return PRD_API if settings.environment == "production" else STG_API


def grab_configured() -> bool:
    return bool(settings.grab_client_id and settings.grab_client_secret)


async def get_access_token() -> str | None:
    if not grab_configured():
        return None
    auth_url = PRD_AUTH if settings.environment == "production" else STG_AUTH
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            auth_url,
            data={
                "client_id": settings.grab_client_id,
                "client_secret": settings.grab_client_secret,
                "grant_type": "client_credentials",
                "scope": "food.partner.api",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        res.raise_for_status()
        return res.json().get("access_token")


async def notify_menu_updated(*, merchant_id: str) -> dict[str, Any]:
    """Tell Grab to pull the latest menu for a merchant."""
    token = await get_access_token()
    if not token:
        logger.info("Grab dry-run: menu notification for merchant=%s", merchant_id)
        return {
            "ok": True,
            "dry_run": True,
            "merchant_id": merchant_id,
            "message": "Grab credentials not configured — simulated publish",
        }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/merchant/menu/notification",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"merchantID": merchant_id},
        )
        if res.status_code >= 400:
            return {
                "ok": False,
                "dry_run": False,
                "status_code": res.status_code,
                "detail": res.text,
            }
        return {
            "ok": True,
            "dry_run": False,
            "merchant_id": merchant_id,
            "job_id": res.headers.get("x-job-id"),
        }


async def accept_reject_order(
    *,
    order_id: str,
    to_state: str,
    message: str | None = None,
) -> dict[str, Any]:
    token = await get_access_token()
    if not token:
        return {"ok": True, "dry_run": True, "order_id": order_id, "to_state": to_state}

    body: dict[str, Any] = {"orderID": order_id, "toState": to_state}
    if message:
        body["message"] = message
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/order/prepare",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        return {
            "ok": res.status_code < 400,
            "dry_run": False,
            "status_code": res.status_code,
            "detail": res.text if res.status_code >= 400 else None,
        }


async def mark_order_ready(*, order_id: str, mark_status: int = 1) -> dict[str, Any]:
    token = await get_access_token()
    if not token:
        return {"ok": True, "dry_run": True, "order_id": order_id}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/orders/mark",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"orderID": order_id, "markStatus": mark_status},
        )
        return {
            "ok": res.status_code < 400,
            "dry_run": False,
            "status_code": res.status_code,
            "detail": res.text if res.status_code >= 400 else None,
        }


async def create_self_serve_activation(*, partner_merchant_id: str) -> dict[str, Any]:
    """Start Grab self-serve activation; merchant opens activationUrl in Grab Merchant."""
    token = await get_access_token()
    if not token:
        # Dry-run link so shops can still practice the connect UX.
        fake = (
            "https://merchant.grab.com/support/self-serve-activation"
            f"?partnerMerchantID={partner_merchant_id}&source=baseapp&dry_run=1"
        )
        logger.info("Grab dry-run: self-serve activation for partner=%s", partner_merchant_id)
        return {
            "ok": True,
            "dry_run": True,
            "activation_url": fake,
            "partner_merchant_id": partner_merchant_id,
            "message": "Grab partner credentials not configured — simulated activation link",
        }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/self-serve/activation",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"partner": {"merchantID": partner_merchant_id}},
        )
        if res.status_code >= 400:
            return {
                "ok": False,
                "dry_run": False,
                "status_code": res.status_code,
                "detail": res.text,
                "partner_merchant_id": partner_merchant_id,
            }
        data = res.json() if res.content else {}
        return {
            "ok": True,
            "dry_run": False,
            "activation_url": data.get("activationUrl") or data.get("activation_url"),
            "partner_merchant_id": partner_merchant_id,
            "message": "Open the activation link and Enable Integration in Grab Merchant",
        }
