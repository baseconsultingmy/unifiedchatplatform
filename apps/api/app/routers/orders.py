"""Vendor order queue (Grab Food and future marketplace channels)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app import grab_client
from app.db import get_db
from app.deps import require_vendor_user
from app.models import Order, OrderStatus, User
from app.schemas import OrderOut, OrderStatusUpdateIn

router = APIRouter(prefix="/orders", tags=["orders"])

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.new.value: {
        OrderStatus.accepted.value,
        OrderStatus.rejected.value,
        OrderStatus.cancelled.value,
    },
    OrderStatus.accepted.value: {
        OrderStatus.preparing.value,
        OrderStatus.ready.value,
        OrderStatus.cancelled.value,
    },
    OrderStatus.preparing.value: {
        OrderStatus.ready.value,
        OrderStatus.cancelled.value,
    },
    OrderStatus.ready.value: {
        OrderStatus.completed.value,
        OrderStatus.cancelled.value,
    },
}


def _order_query(db: Session, tenant_id: int):
    return (
        db.query(Order)
        .options(joinedload(Order.lines))
        .filter(Order.tenant_id == tenant_id)
    )


@router.get("", response_model=list[OrderOut])
def list_orders(
    status: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> list[Order]:
    q = _order_query(db, user.tenant_id)
    if status:
        q = q.filter(Order.status == status)
    if channel:
        q = q.filter(Order.channel == channel)
    return q.order_by(Order.created_at.desc()).limit(200).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Order:
    order = _order_query(db, user.tenant_id).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}", response_model=OrderOut)
async def update_order_status(
    order_id: int,
    payload: OrderStatusUpdateIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Order:
    order = _order_query(db, user.tenant_id).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = payload.status.strip().lower()
    allowed = ALLOWED_TRANSITIONS.get(order.status, set())
    if new_status not in allowed and new_status != order.status:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move order from {order.status} to {new_status}",
        )

    now = datetime.now(timezone.utc)
    if new_status == OrderStatus.accepted.value:
        order.accepted_at = order.accepted_at or now
        if order.channel == "grab" and order.external_order_id:
            await grab_client.accept_reject_order(
                order_id=order.external_order_id,
                to_state="Accepted",
            )
    elif new_status == OrderStatus.rejected.value:
        if order.channel == "grab" and order.external_order_id:
            await grab_client.accept_reject_order(
                order_id=order.external_order_id,
                to_state="Rejected",
                message="Merchant rejected",
            )
    elif new_status == OrderStatus.ready.value:
        order.ready_at = order.ready_at or now
        if order.status == OrderStatus.new.value:
            order.accepted_at = order.accepted_at or now
        if order.channel == "grab" and order.external_order_id:
            await grab_client.mark_order_ready(order_id=order.external_order_id)
    elif new_status == OrderStatus.cancelled.value:
        if order.channel == "grab" and order.external_order_id:
            from app.models import Tenant

            tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
            merchant_id = (tenant.grab_merchant_id if tenant else None) or ""
            if merchant_id:
                result = await grab_client.cancel_order(
                    order_id=order.external_order_id,
                    merchant_id=merchant_id,
                    cancel_code=1001,
                )
                if not result.get("ok") and not result.get("dry_run"):
                    raise HTTPException(
                        status_code=502,
                        detail=result.get("detail") or "Grab cancel order failed",
                    )
    elif new_status == OrderStatus.completed.value:
        order.completed_at = order.completed_at or now
        order.ready_at = order.ready_at or now

    order.status = new_status
    db.commit()
    db.refresh(order)
    return order
