from __future__ import annotations

import secrets
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Booking, BookingStatus, PaymentStatus, Service


def amount_due(booking: Booking) -> Decimal:
    deposit = Decimal(str(booking.deposit_amount or 0))
    total = Decimal(str(booking.amount or 0))
    if deposit > 0:
        return deposit
    return total


def attach_payment_link(db: Session, booking: Booking) -> Booking:
    if booking.payment_token and booking.payment_url:
        return booking

    token = secrets.token_urlsafe(24)
    booking.payment_token = token
    booking.payment_url = f"{settings.public_api_base.rstrip('/')}/pay/{token}"
    db.add(booking)
    db.flush()
    return booking


def ensure_deposit_amount(booking: Booking, service: Service | None) -> None:
    if service is not None:
        booking.deposit_amount = service.deposit_amount or 0


def mark_booking_paid(db: Session, booking: Booking) -> Booking:
    due = amount_due(booking)
    total = Decimal(str(booking.amount or 0))
    if due > 0 and due < total:
        booking.payment_status = PaymentStatus.deposit_paid
    else:
        booking.payment_status = PaymentStatus.paid
    booking.status = BookingStatus.confirmed
    booking.paid_at = datetime.now(timezone.utc)
    db.add(booking)
    db.flush()
    return booking
