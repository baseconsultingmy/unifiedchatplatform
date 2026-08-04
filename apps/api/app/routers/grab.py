"""Grab Food POS integration — publish, menu pull, order webhooks, simulate."""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload

from app import grab_client
from app.config import settings
from app.db import get_db
from app.deps import require_vendor_user
from app.grab_menu import build_grab_menu, channel_price_map
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
        "2. Paste the Grab merchant ID Grab shows after linking (or keep partner ID for dry-run).",
        "3. Set markup / overrides on Menu, then Publish to Grab.",
        "4. New Grab orders appear under Orders.",
    ]
    if not grab_client.grab_configured():
        notes.append(
            "Platform Grab partner credentials are not set yet — Connect / Publish run in dry-run."
        )
    if status == "activation_pending":
        notes.insert(0, "Activation started — finish Enable Integration in Grab Merchant.")
    return GrabStatusOut(
        configured=bool(tenant.grab_merchant_id) or status in ("activation_pending", "ready"),
        connected=connected,
        dry_run_available=True,
        partner_merchant_id=tenant.slug,
        merchant_id=tenant.grab_merchant_id,
        markup_percent=float(tenant.grab_markup_percent or 30),
        sync_status=status,
        last_synced_at=tenant.grab_last_synced_at,
        activation_url=tenant.grab_activation_url,
        partner_token_set=bool(tenant.grab_partner_token),
        platform_credentials_set=grab_client.grab_configured(),
        menu_webhook_url=f"{base}/v1/webhooks/grab/merchant/menu",
        orders_webhook_url=f"{base}/v1/webhooks/grab/orders",
        sync_state_webhook_url=f"{base}/v1/webhooks/grab/menu/sync-state",
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
    """Inbound Grab submit-order webhook → create Order in panel."""
    _verify_grab_webhook(authorization, x_grab_signature)
    body = await request.json()
    merchant_id = body.get("merchantID") or body.get("partnerMerchantID")
    tenant = _find_tenant_by_merchant(db, merchant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Merchant not found")

    external_id = str(body.get("orderID") or body.get("orderId") or "").strip()
    if not external_id:
        raise HTTPException(status_code=400, detail="orderID required")

    existing = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant.id,
            Order.channel == "grab",
            Order.external_order_id == external_id,
        )
        .first()
    )
    if existing:
        return {"ok": True, "order_id": existing.id, "duplicate": True}

    prices = channel_price_map(db, tenant.id)
    services = {
        s.id: s
        for s in db.query(Service).filter(Service.tenant_id == tenant.id).all()
    }
    by_external = {
        (cp.external_id or f"svc-{cp.service_id}"): cp.service_id for cp in prices.values()
    }
    for sid in services:
        by_external.setdefault(f"svc-{sid}", sid)

    def from_grab_money(raw) -> float:
        """Grab amounts are minor units (e.g. 1900 = RM19.00)."""
        if raw is None:
            return 0.0
        val = float(raw)
        return round(val / 100.0, 2)

    price_block = body.get("price") or {}
    currency = (body.get("currency") or {}).get("code") or "MYR"
    items = body.get("items") or []
    receiver = body.get("receiver") or {}
    phones = receiver.get("phones") if isinstance(receiver.get("phones"), list) else []

    order = Order(
        tenant_id=tenant.id,
        channel="grab",
        status=OrderStatus.new.value,
        external_order_id=external_id,
        short_order_number=body.get("shortOrderNumber"),
        customer_name=receiver.get("name") or body.get("customerName") or "Grab Customer",
        customer_phone=(phones[0] if phones else None) or body.get("customerPhone"),
        currency=currency,
        notes=body.get("remark") or body.get("notes"),
        raw_payload=json.dumps(body)[:20000],
        subtotal_amount=from_grab_money(
            price_block.get("subtotal") or price_block.get("eaterPayment") or 0
        ),
        total_amount=from_grab_money(
            price_block.get("eaterPayment") or price_block.get("subtotal") or 0
        ),
    )
    db.add(order)
    db.flush()

    computed_subtotal = Decimal("0")
    for item in items:
        ext_id = str(item.get("id") or item.get("itemID") or "")
        sid = by_external.get(ext_id)
        service = services.get(sid) if sid else None
        qty = max(1, int(item.get("quantity") or 1))
        if item.get("price") is not None:
            unit = Decimal(str(from_grab_money(item.get("price"))))
        elif service:
            unit = compute_channel_price(
                base_price=service.price_amount,
                tenant=tenant,
                channel_price=prices.get(service.id),
                channel="grab",
            )
        else:
            unit = Decimal("0")
        line_total = unit * qty
        computed_subtotal += line_total
        db.add(
            OrderLine(
                order_id=order.id,
                service_id=service.id if service else None,
                external_item_id=ext_id or None,
                name=item.get("name") or (service.name if service else "Item"),
                quantity=qty,
                unit_price=float(unit),
                line_total=float(line_total),
                notes=item.get("specifications") or item.get("notes"),
            )
        )

    if not order.total_amount and computed_subtotal:
        order.subtotal_amount = float(computed_subtotal)
        order.total_amount = float(computed_subtotal)

    db.commit()
    logger.info(
        "Grab order ingested tenant=%s external=%s total=%s",
        tenant.slug,
        external_id,
        order.total_amount,
    )
    return {"ok": True, "order_id": order.id}


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
