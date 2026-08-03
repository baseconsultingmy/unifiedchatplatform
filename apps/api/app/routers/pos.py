from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Booking, BookingStatus, Channel, Customer, PaymentStatus, Service, User
from app.payments import amount_due, attach_payment_link
from app.schemas import BookingOut, PosSaleIn, PosSaleOut

router = APIRouter(prefix="/pos", tags=["pos"])


def _booking_out(db: Session, booking_id: int) -> Booking:
    return (
        db.query(Booking)
        .options(joinedload(Booking.customer), joinedload(Booking.service))
        .filter(Booking.id == booking_id)
        .one()
    )


@router.post("/sale", response_model=PosSaleOut, status_code=status.HTTP_201_CREATED)
def create_walkin_sale(
    payload: PosSaleIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosSaleOut:
    service = (
        db.query(Service)
        .filter(
            Service.id == payload.service_id,
            Service.tenant_id == user.tenant_id,
            Service.is_active.is_(True),
        )
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")

    phone = (payload.customer_phone or "").strip()
    if not phone:
        phone = f"walkin-{int(datetime.now(timezone.utc).timestamp())}"

    customer = (
        db.query(Customer)
        .filter(Customer.tenant_id == user.tenant_id, Customer.phone == phone)
        .first()
    )
    if customer is None:
        customer = Customer(
            tenant_id=user.tenant_id,
            name=payload.customer_name or "Walk-in",
            phone=phone,
        )
        db.add(customer)
        db.flush()
    elif payload.customer_name and not customer.name:
        customer.name = payload.customer_name

    starts_at = payload.starts_at or datetime.now(timezone.utc)
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    ends_at = starts_at + timedelta(minutes=int(service.duration_minutes or 60))

    amount = Decimal(str(service.price_amount or 0))
    deposit = Decimal(str(service.deposit_amount or 0))
    if payload.charge_mode == "deposit" and deposit > 0:
        due_deposit = deposit
        payment_status = PaymentStatus.deposit_due
    else:
        # Full amount due via pay link / cash
        due_deposit = Decimal("0")
        payment_status = PaymentStatus.unpaid

    booking = Booking(
        tenant_id=user.tenant_id,
        customer_id=customer.id,
        service_id=service.id,
        channel=Channel.manual,
        status=BookingStatus.confirmed,
        payment_status=payment_status,
        starts_at=starts_at,
        ends_at=ends_at,
        amount=amount,
        deposit_amount=due_deposit if payload.charge_mode == "deposit" else Decimal("0"),
        currency=service.currency or "MYR",
        notes=payload.notes or "Walk-in POS sale",
        external_ref=f"pos-{int(datetime.now(timezone.utc).timestamp())}",
    )
    db.add(booking)
    db.flush()
    attach_payment_link(db, booking)

    already_paid = False
    if payload.payment_method == "cash":
        # Cash always settles the charged amount in full for this sale.
        if payload.charge_mode == "deposit" and deposit > 0 and deposit < amount:
            booking.payment_status = PaymentStatus.deposit_paid
        else:
            booking.payment_status = PaymentStatus.paid
        booking.status = BookingStatus.confirmed
        booking.paid_at = datetime.now(timezone.utc)
        already_paid = True
    # qr: leave unpaid/deposit_due; staff shows QR for customer to scan

    db.commit()
    booking = _booking_out(db, booking.id)
    due = amount_due(booking)
    return PosSaleOut(
        booking=BookingOut.model_validate(booking),
        payment_method=payload.payment_method,
        amount_due=due,
        currency=booking.currency,
        payment_url=booking.payment_url,
        already_paid=already_paid,
    )
