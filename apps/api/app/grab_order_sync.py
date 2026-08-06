"""Upsert Grab Food orders from webhook / list-orders payloads."""

from __future__ import annotations

import json
import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.grab_menu import channel_price_map
from app.models import Order, OrderLine, OrderStatus, Service, Tenant
from app.pricing import compute_channel_price

logger = logging.getLogger(__name__)

GRAB_STATE_MAP = {
    "NEW": OrderStatus.new.value,
    "PENDING_ACCEPTANCE": OrderStatus.new.value,
    "DRIVER_ALLOCATED": OrderStatus.accepted.value,
    "DRIVER_ARRIVED": OrderStatus.accepted.value,
    "COLLECTED": OrderStatus.ready.value,
    "DELIVERING": OrderStatus.ready.value,
    "DELIVERED": OrderStatus.completed.value,
    "COMPLETED": OrderStatus.completed.value,
    "CANCELLED": OrderStatus.cancelled.value,
    "CANCELED": OrderStatus.cancelled.value,
    "FAILED": OrderStatus.cancelled.value,
    "REJECTED": OrderStatus.rejected.value,
}


def from_grab_money(raw) -> float:
    if raw is None:
        return 0.0
    return round(float(raw) / 100.0, 2)


def upsert_grab_order(db: Session, tenant: Tenant, body: dict) -> tuple[Order, bool]:
    """Create or update a local Order from a Grab order JSON object.

    Returns (order, created).
    """
    external_id = str(body.get("orderID") or body.get("orderId") or "").strip()
    if not external_id:
        raise ValueError("orderID required")

    existing = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant.id,
            Order.channel == "grab",
            Order.external_order_id == external_id,
        )
        .first()
    )

    prices = channel_price_map(db, tenant.id)
    services = {
        s.id: s for s in db.query(Service).filter(Service.tenant_id == tenant.id).all()
    }
    by_external = {
        (cp.external_id or f"svc-{cp.service_id}"): cp.service_id for cp in prices.values()
    }
    for sid in services:
        by_external.setdefault(f"svc-{sid}", sid)

    price_block = body.get("price") or {}
    currency = (body.get("currency") or {}).get("code") or "MYR"
    items = body.get("items") or []
    receiver = body.get("receiver") or {}
    phones_raw = receiver.get("phones")
    if isinstance(phones_raw, list):
        phone = phones_raw[0] if phones_raw else None
    else:
        phone = phones_raw
    phone = phone or body.get("customerPhone")

    grab_state = str(body.get("orderState") or body.get("state") or "").upper()
    mapped_status = GRAB_STATE_MAP.get(grab_state)

    if existing:
        created = False
        order = existing
        order.short_order_number = body.get("shortOrderNumber") or order.short_order_number
        order.customer_name = (
            receiver.get("name") or body.get("customerName") or order.customer_name
        )
        order.customer_phone = phone or order.customer_phone
        order.notes = body.get("remark") or body.get("notes") or order.notes
        order.raw_payload = json.dumps(body)[:20000]
        if price_block:
            order.subtotal_amount = from_grab_money(
                price_block.get("subtotal") or price_block.get("eaterPayment") or 0
            ) or order.subtotal_amount
            order.total_amount = from_grab_money(
                price_block.get("eaterPayment") or price_block.get("total") or 0
            ) or order.total_amount
        if mapped_status and order.status in (
            OrderStatus.new.value,
            OrderStatus.accepted.value,
            OrderStatus.preparing.value,
            OrderStatus.ready.value,
        ):
            # Don't regress a locally advanced ticket unless Grab says cancelled/completed.
            if mapped_status in (
                OrderStatus.cancelled.value,
                OrderStatus.rejected.value,
                OrderStatus.completed.value,
            ):
                order.status = mapped_status
        db.flush()
        return order, created

    order = Order(
        tenant_id=tenant.id,
        channel="grab",
        status=mapped_status or OrderStatus.new.value,
        external_order_id=external_id,
        short_order_number=body.get("shortOrderNumber"),
        customer_name=receiver.get("name") or body.get("customerName") or "Grab Customer",
        customer_phone=phone,
        currency=currency,
        notes=body.get("remark") or body.get("notes"),
        raw_payload=json.dumps(body)[:20000],
        subtotal_amount=from_grab_money(
            price_block.get("subtotal") or price_block.get("eaterPayment") or 0
        ),
        total_amount=from_grab_money(
            price_block.get("eaterPayment")
            or price_block.get("total")
            or price_block.get("subtotal")
            or 0
        ),
    )
    db.add(order)
    db.flush()

    computed_subtotal = Decimal("0")
    for item in items:
        ext_id = str(item.get("id") or item.get("itemID") or "")
        # Grab may append #index to item id
        base_ext = ext_id.split("#", 1)[0] if ext_id else ""
        sid = by_external.get(ext_id) or by_external.get(base_ext)
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

    db.flush()
    logger.info(
        "Grab order created tenant=%s external=%s total=%s",
        tenant.slug,
        external_id,
        order.total_amount,
    )
    return order, True
