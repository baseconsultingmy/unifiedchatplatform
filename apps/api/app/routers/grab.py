"""Grab Food POS integration — publish, menu pull, order webhooks, simulate."""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session, joinedload

from app import grab_client
from app.config import settings
from app.db import get_db
from app.deps import require_vendor_user
from app.grab_menu import build_grab_menu, channel_price_map
from app.grab_order_sync import upsert_grab_order
from app.models import Order, OrderLine, OrderStatus, Service, Tenant, User
from app.pricing import compute_channel_price
from app.schemas import (
    GrabConnectOut,
    GrabPublishOut,
    GrabSimulateOrderIn,
    GrabStatusOut,
    OrderOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["grab"])


def _find_tenant_by_merchant(db: Session, merchant_id: str | None) -> Tenant | None:
    if not merchant_id:
        return None
    return (
        db.query(Tenant)
        .filter(
            (Tenant.grab_merchant_id == merchant_id) | (Tenant.slug == merchant_id),
            Tenant.is_platform.is_(False),
        )
        .first()
    )


def _verify_grab_webhook(
    authorization: str | None,
    x_grab_signature: str | None = None,
) -> None:
    """Best-effort partner auth. When secret unset, allow (sandbox / dry-run)."""
    secret = (settings.grab_partner_webhook_secret or "").strip()
    if not secret:
        return
    auth = (authorization or "").strip()
    if auth == f"Bearer {secret}" or auth == secret:
        return
    if x_grab_signature and x_grab_signature == secret:
        return
    raise HTTPException(status_code=401, detail="Invalid Grab webhook credentials")


def _grab_status_for_tenant(tenant: Tenant) -> GrabStatusOut:
    base = settings.public_api_base.rstrip("/")
    status = tenant.grab_sync_status or "not_configured"
    connected = bool(tenant.grab_merchant_id) and status not in (
        "not_configured",
        "activation_pending",
    )
    notes = [
        "1. Tap Connect Grab — open the activation link and Enable Integration in Grab Merchant.",
        "2. Paste the Grab merchant ID Grab shows after linking.",
        "3. Publish the menu to Grab.",
        "4. New Grab orders appear under Orders.",
    ]
    if status == "activation_pending":
        notes.insert(0, "Activation started — finish Enable Integration in Grab Merchant.")
    return GrabStatusOut(
        configured=bool(tenant.grab_merchant_id) or status in ("activation_pending", "ready"),
        connected=connected,
        dry_run_available=True,
        partner_merchant_id=tenant.slug,
        merchant_id=tenant.grab_merchant_id,
        sync_status=status,
        last_synced_at=tenant.grab_last_synced_at,
        activation_url=tenant.grab_activation_url,
        partner_token_set=bool(tenant.grab_partner_token),
        platform_credentials_set=grab_client.grab_configured(),
        menu_webhook_url=f"{base}/v1/webhooks/grab/merchant/menu",
        orders_webhook_url=f"{base}/v1/webhooks/grab/orders",
        sync_state_webhook_url=f"{base}/v1/webhooks/grab/menu/sync-state",
        integration_status_webhook_url=f"{base}/v1/webhooks/grab/push-integration-status",
        order_state_webhook_url=f"{base}/v1/webhooks/grab/order-state",
        notes=notes,
    )


@router.get("/grab/status", response_model=GrabStatusOut)
def grab_status(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> GrabStatusOut:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return _grab_status_for_tenant(tenant)


@router.post("/grab/connect", response_model=GrabConnectOut)
async def connect_grab(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> GrabConnectOut:
    """Create Grab self-serve activation journey for this shop."""
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    partner_id = tenant.slug
    result = await grab_client.create_self_serve_activation(partner_merchant_id=partner_id)
    if not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=result.get("detail") or "Could not start Grab activation",
        )

    activation_url = result.get("activation_url")
    tenant.grab_activation_url = activation_url
    if not (tenant.grab_merchant_id or "").strip():
        # Until Grab returns the real merchantID, partner slug is used for dry-run mapping.
        tenant.grab_merchant_id = partner_id
    if tenant.grab_sync_status in (None, "", "not_configured"):
        tenant.grab_sync_status = "activation_pending"
    db.commit()

    return GrabConnectOut(
        ok=True,
        dry_run=bool(result.get("dry_run")),
        partner_merchant_id=partner_id,
        activation_url=activation_url,
        sync_status=tenant.grab_sync_status or "activation_pending",
        message=result.get("message")
        or "Open the activation link in Grab Merchant and Enable Integration",
    )


@router.post("/grab/publish", response_model=GrabPublishOut)
async def publish_menu_to_grab(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> GrabPublishOut:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not (tenant.grab_merchant_id or "").strip():
        # Dry-run convenience: use slug as merchant id so demos can publish.
        tenant.grab_merchant_id = tenant.slug

    menu = build_grab_menu(db, tenant)
    item_count = sum(len(cat.get("items") or []) for cat in menu.get("categories") or [])
    prices = channel_price_map(db, tenant.id)
    for cp in prices.values():
        cp.is_published = True

    result = await grab_client.notify_menu_updated(merchant_id=tenant.grab_merchant_id)
    now = datetime.now(timezone.utc)
    tenant.grab_last_synced_at = now
    if result.get("ok"):
        tenant.grab_sync_status = "published_dry_run" if result.get("dry_run") else "published"
        message = result.get("message") or "Menu publish notified Grab"
    else:
        tenant.grab_sync_status = "error"
        message = result.get("detail") or "Grab menu notification failed"
    db.commit()

    return GrabPublishOut(
        ok=bool(result.get("ok")),
        dry_run=bool(result.get("dry_run")),
        merchant_id=tenant.grab_merchant_id,
        item_count=item_count,
        message=message,
        sync_status=tenant.grab_sync_status,
    )


@router.post("/grab/fetch-orders")
async def fetch_grab_orders(
    date: str | None = Query(default=None, description="YYYY-MM-DD (Grab local outlet date)"),
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> dict:
    """Pull orders from Grab List Orders API and upsert into the local Orders queue.

    Note: Grab documents this endpoint as unavailable in staging; requires live credentials.
    """
    from datetime import date as date_cls

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    merchant_id = (tenant.grab_merchant_id or "").strip()
    if not merchant_id:
        raise HTTPException(status_code=400, detail="Set Grab merchant ID before fetching orders")

    report_date = date or date_cls.today().isoformat()
    created = 0
    updated = 0
    page = 0
    remote_count = 0
    errors: list[str] = []

    while page < 50:
        result = await grab_client.list_orders(
            merchant_id=merchant_id,
            date=report_date,
            page=page,
        )
        if result.get("dry_run"):
            return {
                "ok": True,
                "dry_run": True,
                "message": result.get("message"),
                "created": 0,
                "updated": 0,
                "remote_count": 0,
            }
        if not result.get("ok"):
            raise HTTPException(
                status_code=502,
                detail=result.get("detail") or "Grab list orders failed",
            )
        for raw in result.get("orders") or []:
            remote_count += 1
            try:
                _, was_created = upsert_grab_order(db, tenant, raw)
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))
        db.commit()
        if not result.get("more"):
            break
        page += 1

    return {
        "ok": True,
        "dry_run": False,
        "date": report_date,
        "created": created,
        "updated": updated,
        "remote_count": remote_count,
        "errors": errors[:10],
        "message": f"Synced {remote_count} Grab orders ({created} new, {updated} updated)",
    }


@router.post("/grab/simulate-order", response_model=OrderOut, status_code=201)
def simulate_grab_order(
    payload: GrabSimulateOrderIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Order:
    """Create a Grab-like order locally when partner credentials are not live."""
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    services = (
        db.query(Service)
        .filter(Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .all()
    )
    if not services:
        raise HTTPException(status_code=400, detail="No menu items to simulate an order")

    prices = channel_price_map(db, tenant.id)
    requested = payload.items or []
    lines_data: list[tuple[Service, int]] = []
    if requested:
        by_id = {s.id: s for s in services}
        for raw in requested:
            sid = int(raw.get("service_id") or 0)
            qty = max(1, int(raw.get("quantity") or 1))
            service = by_id.get(sid)
            if service:
                lines_data.append((service, qty))
    if not lines_data:
        # Default: first two menu items
        for service in services[:2]:
            lines_data.append((service, 1))

    subtotal = Decimal("0")
    order = Order(
        tenant_id=tenant.id,
        channel="grab",
        status=OrderStatus.new.value,
        external_order_id=f"SIM-{secrets.token_hex(6).upper()}",
        short_order_number=f"G-{secrets.randbelow(900) + 100}",
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        currency="MYR",
        notes=payload.notes or "Simulated Grab order (dry-run)",
        raw_payload=json.dumps({"simulate": True}),
    )
    db.add(order)
    db.flush()

    for service, qty in lines_data:
        unit = compute_channel_price(
            base_price=service.price_amount,
            tenant=tenant,
            channel_price=prices.get(service.id),
            channel="grab",
        )
        line_total = unit * qty
        subtotal += line_total
        db.add(
            OrderLine(
                order_id=order.id,
                service_id=service.id,
                external_item_id=f"svc-{service.id}",
                name=service.name,
                quantity=qty,
                unit_price=float(unit),
                line_total=float(line_total),
            )
        )

    order.subtotal_amount = float(subtotal)
    order.total_amount = float(subtotal)
    db.commit()
    return (
        db.query(Order)
        .options(joinedload(Order.lines))
        .filter(Order.id == order.id)
        .first()
    )


@router.get("/webhooks/grab/merchant/menu")
def grab_get_menu(
    merchantID: str | None = Query(default=None),
    partnerMerchantID: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Grab pulls menu after notification — return Grab-shaped catalog."""
    _verify_grab_webhook(authorization)
    tenant = _find_tenant_by_merchant(db, merchantID) or _find_tenant_by_merchant(
        db, partnerMerchantID
    )
    if tenant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")
    menu = build_grab_menu(db, tenant)
    db.commit()
    return menu


@router.post("/webhooks/grab/orders")
async def grab_submit_order(
    request: Request,
    authorization: str | None = Header(default=None),
    x_grab_signature: str | None = Header(default=None, alias="X-Grab-Signature"),
    db: Session = Depends(get_db),
) -> dict:
    """Inbound Grab submit-order webhook → create/update Order in panel."""
    _verify_grab_webhook(authorization, x_grab_signature)
    body = await request.json()
    merchant_id = body.get("merchantID") or body.get("partnerMerchantID")
    tenant = _find_tenant_by_merchant(db, merchant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")
    try:
        order, created = upsert_grab_order(db, tenant, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    return {"ok": True, "order_id": order.id, "created": created, "duplicate": not created}


@router.post("/webhooks/grab/menu/sync-state")
async def grab_menu_sync_state(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    _verify_grab_webhook(authorization)
    body = await request.json()
    merchant_id = body.get("merchantID") or body.get("partnerMerchantID")
    tenant = _find_tenant_by_merchant(db, merchant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")
    status = (body.get("status") or body.get("code") or "SYNCING").upper()
    if status in ("SUCCESS", "SUCCESSFUL", "COMPLETED"):
        tenant.grab_sync_status = "synced"
    elif status in ("FAILED", "FAIL", "ERROR"):
        tenant.grab_sync_status = "sync_failed"
    else:
        tenant.grab_sync_status = "syncing"
    tenant.grab_last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/webhooks/grab/push-integration-status", status_code=204)
async def grab_push_integration_status(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """Grab notifies partner when store integration status changes."""
    _verify_grab_webhook(authorization)
    body = await request.json()
    partner_id = body.get("partnerMerchantID")
    grab_id = body.get("grabMerchantID") or body.get("merchantID")
    tenant = _find_tenant_by_merchant(db, partner_id) or _find_tenant_by_merchant(db, grab_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")

    status = str(body.get("integrationStatus") or "").upper()
    if grab_id:
        tenant.grab_merchant_id = str(grab_id)
    if status == "ACTIVE":
        tenant.grab_sync_status = "ready"
    elif status == "SYNCING":
        tenant.grab_sync_status = "syncing"
    elif status == "FAILED":
        tenant.grab_sync_status = "error"
    elif status == "INACTIVE":
        tenant.grab_sync_status = "not_configured"
    tenant.grab_last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=204)


@router.post("/webhooks/grab/order-state")
async def grab_push_order_state(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Grab pushes order state updates (and optionally full order object)."""
    _verify_grab_webhook(authorization)
    body = await request.json()
    order_block = body.get("order") if isinstance(body.get("order"), dict) else body
    merchant_id = (
        order_block.get("merchantID")
        or order_block.get("partnerMerchantID")
        or body.get("merchantID")
        or body.get("partnerMerchantID")
    )
    tenant = _find_tenant_by_merchant(db, merchant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")

    # Normalize state onto the order payload
    if body.get("state") and not order_block.get("orderState"):
        order_block = {**order_block, "orderState": body.get("state")}
    if body.get("orderID") and not order_block.get("orderID"):
        order_block = {**order_block, "orderID": body.get("orderID")}

    try:
        order, created = upsert_grab_order(db, tenant, order_block)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    return {"ok": True, "order_id": order.id, "created": created}
