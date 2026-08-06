"""Grab Food POS partner client (API v1.1.3).

Full partner activation requires Grab Open Platform credentials.
When tokens are missing we run in dry-run mode so menu publish / order
flows can be tested end-to-end inside BaseApp.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

STG_API = "https://partner-api.grab.com/grabfood-sandbox"
PRD_API = "https://partner-api.grab.com/grabfood"
AUTH_URL = "https://api.grab.com/grabid/v1/oauth2/token"

_token_cache: dict[str, Any] = {"token": None, "expires_at": 0.0}


def grab_api_base() -> str:
    return PRD_API if settings.environment == "production" else STG_API


def grab_configured() -> bool:
    return bool(settings.grab_client_id and settings.grab_client_secret)


async def get_access_token(*, force: bool = False) -> str | None:
    if not grab_configured():
        return None
    now = time.time()
    if (
        not force
        and _token_cache.get("token")
        and float(_token_cache.get("expires_at") or 0) > now + 60
    ):
        return str(_token_cache["token"])

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            AUTH_URL,
            data={
                "client_id": settings.grab_client_id,
                "client_secret": settings.grab_client_secret,
                "grant_type": "client_credentials",
                "scope": "food.partner.api",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if res.status_code >= 400:
            logger.error("Grab OAuth failed: %s %s", res.status_code, res.text)
            return None
        data = res.json()
        token = data.get("access_token")
        expires_in = int(data.get("expires_in") or 3600)
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + expires_in
        return token


async def _auth_headers() -> dict[str, str] | None:
    token = await get_access_token()
    if not token:
        return None
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


async def notify_menu_updated(*, merchant_id: str) -> dict[str, Any]:
    """Tell Grab to pull the latest menu for a merchant."""
    headers = await _auth_headers()
    if not headers:
        logger.info("Grab dry-run: menu notification for merchant=%s", merchant_id)
        return {
            "ok": True,
            "dry_run": True,
            "merchant_id": merchant_id,
            "message": "Menu publish queued",
        }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/merchant/menu/notification",
            headers=headers,
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


async def update_menu_item(
    *,
    merchant_id: str,
    item_id: str,
    price: int | None = None,
    available_status: str | None = None,
) -> dict[str, Any]:
    """Targeted price/availability update (PUT /partner/v1/menu)."""
    headers = await _auth_headers()
    if not headers:
        return {"ok": True, "dry_run": True, "item_id": item_id}

    body: dict[str, Any] = {
        "merchantID": merchant_id,
        "field": "ITEM",
        "id": item_id,
    }
    if price is not None:
        body["price"] = price
    if available_status:
        body["availableStatus"] = available_status

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.put(
            f"{grab_api_base()}/partner/v1/menu",
            headers=headers,
            json=body,
        )
        return {
            "ok": res.status_code < 400,
            "dry_run": False,
            "status_code": res.status_code,
            "detail": res.text if res.status_code >= 400 else None,
        }


async def list_orders(
    *,
    merchant_id: str,
    date: str | None = None,
    page: int = 0,
    order_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Fetch orders from Grab (prod only; staging may not support)."""
    headers = await _auth_headers()
    if not headers:
        return {
            "ok": True,
            "dry_run": True,
            "more": False,
            "orders": [],
            "message": "Grab credentials not configured — cannot list remote orders",
        }

    params: dict[str, Any] = {"merchantID": merchant_id}
    if order_ids:
        params["orderIDs"] = order_ids
    else:
        if date:
            params["date"] = date
        params["page"] = page

    async with httpx.AsyncClient(timeout=45) as client:
        res = await client.get(
            f"{grab_api_base()}/partner/v1/orders",
            headers=headers,
            params=params,
        )
        if res.status_code >= 400:
            return {
                "ok": False,
                "dry_run": False,
                "status_code": res.status_code,
                "detail": res.text,
                "more": False,
                "orders": [],
            }
        data = res.json() if res.content else {}
        return {
            "ok": True,
            "dry_run": False,
            "more": bool(data.get("more")),
            "orders": data.get("orders") or [],
        }


async def cancel_order(
    *,
    order_id: str,
    merchant_id: str,
    cancel_code: int = 1001,
) -> dict[str, Any]:
    headers = await _auth_headers()
    if not headers:
        return {"ok": True, "dry_run": True, "order_id": order_id}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.put(
            f"{grab_api_base()}/partner/v1/order/cancel",
            headers=headers,
            json={
                "orderID": order_id,
                "merchantID": merchant_id,
                "cancelCode": cancel_code,
            },
        )
        return {
            "ok": res.status_code < 400,
            "dry_run": False,
            "status_code": res.status_code,
            "detail": res.text if res.status_code >= 400 else None,
            "body": res.json() if res.content and res.status_code < 400 else None,
        }


async def accept_reject_order(
    *,
    order_id: str,
    to_state: str,
    message: str | None = None,
) -> dict[str, Any]:
    headers = await _auth_headers()
    if not headers:
        return {"ok": True, "dry_run": True, "order_id": order_id, "to_state": to_state}

    body: dict[str, Any] = {"orderID": order_id, "toState": to_state}
    if message:
        body["message"] = message
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/order/prepare",
            headers=headers,
            json=body,
        )
        return {
            "ok": res.status_code < 400,
            "dry_run": False,
            "status_code": res.status_code,
            "detail": res.text if res.status_code >= 400 else None,
        }


async def mark_order_ready(*, order_id: str, mark_status: int = 1) -> dict[str, Any]:
    headers = await _auth_headers()
    if not headers:
        return {"ok": True, "dry_run": True, "order_id": order_id}

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/orders/mark",
            headers=headers,
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
    headers = await _auth_headers()
    if not headers:
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
            "message": "Open the activation link and Enable Integration in Grab Merchant",
        }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            f"{grab_api_base()}/partner/v1/self-serve/activation",
            headers=headers,
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
