"""Create / hold a booking from WhatsApp (web sheet or native Flow)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.availability import available_slots, busy_bookings, slot_conflicts, tenant_tz
from app.currency import tenant_currency
from app.models import (
    Booking,
    BookingStatus,
    Channel,
    Conversation,
    Customer,
    PaymentStatus,
    Service,
    Tenant,
)
from app.payments import amount_due, attach_payment_link


class ReserveError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def reserve_channel_booking(
    db: Session,
    *,
    tenant: Tenant,
    external_id: str,
    channel: str = "whatsapp",
    service_id: int,
    starts_at: datetime,
    customer_name: str | None = None,
    external_ref_prefix: str = "wa",
) -> tuple[Booking, Service]:
    """Reserve a booking for WhatsApp (phone) or LINE (user id)."""
    channel_key = (channel or "whatsapp").lower()
    if channel_key == "line":
        identity = (external_id or "").strip()
        if len(identity) < 8:
            raise ReserveError("Invalid LINE user", 400)
        channel_enum = Channel.line
        guest_label = "LINE guest"
    else:
        identity = "".join(ch for ch in external_id if ch.isdigit())
        if len(identity) < 8:
            raise ReserveError("Invalid phone", 400)
        channel_enum = Channel.whatsapp
        guest_label = "WhatsApp guest"

    service = (
        db.query(Service)
        .filter(
            Service.id == service_id,
            Service.tenant_id == tenant.id,
            Service.is_active.is_(True),
        )
        .first()
    )
    if service is None:
        raise ReserveError("Package not found", 404)

    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=tenant_tz(tenant))

    duration = int(service.duration_minutes or 60)
    ends_at = starts_at + timedelta(minutes=duration)

    day_slots = available_slots(
        db,
        tenant,
        day=starts_at.astimezone(tenant_tz(tenant)).date(),
        duration_minutes=duration,
    )
    if not any(
        abs((s.astimezone(timezone.utc) - starts_at.astimezone(timezone.utc)).total_seconds()) < 60
        for s in day_slots
    ):
        raise ReserveError("That slot is no longer available", 409)

    busy = busy_bookings(
        db,
        tenant.id,
        starts_at.astimezone(timezone.utc) - timedelta(minutes=1),
        ends_at.astimezone(timezone.utc) + timedelta(minutes=1),
    )
    if slot_conflicts(starts_at.astimezone(timezone.utc), ends_at.astimezone(timezone.utc), busy):
        raise ReserveError("That slot was just taken", 409)

    customer = (
        db.query(Customer)
        .filter(Customer.tenant_id == tenant.id, Customer.phone == identity)
        .first()
    )
    if customer is None:
        customer = Customer(
            tenant_id=tenant.id,
            phone=identity,
            name=(customer_name or "").strip() or guest_label,
        )
        db.add(customer)
        db.flush()
    elif customer_name and customer_name.strip():
        customer.name = customer_name.strip()

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.tenant_id == tenant.id,
            Conversation.channel == channel_enum,
            Conversation.external_thread_id == identity,
        )
        .first()
    )
    if conversation is None:
        conversation = Conversation(
            tenant_id=tenant.id,
            customer_id=customer.id,
            channel=channel_enum,
            external_thread_id=identity,
            status="open",
            flow_state="idle",
        )
        db.add(conversation)
        db.flush()
    else:
        conversation.customer_id = customer.id
        conversation.flow_state = "idle"
        conversation.flow_context = "{}"

    deposit = Decimal(str(service.deposit_amount or 0))
    booking = Booking(
        tenant_id=tenant.id,
        customer_id=customer.id,
        service_id=service.id,
        channel=channel_enum,
        status=BookingStatus.held,
        payment_status=PaymentStatus.deposit_due if deposit > 0 else PaymentStatus.unpaid,
        starts_at=starts_at,
        ends_at=ends_at,
        amount=Decimal(str(service.price_amount or 0)),
        deposit_amount=deposit,
        currency=tenant_currency(tenant),
        notes=starts_at.astimezone(tenant_tz(tenant)).strftime("%a %d %b · %I:%M %p").replace(" 0", " "),
        external_ref=f"{external_ref_prefix}-{identity[:24]}-{int(datetime.now(timezone.utc).timestamp())}",
    )
    db.add(booking)
    db.flush()
    attach_payment_link(db, booking)
    db.commit()
    db.refresh(booking)
    return booking, service


def reserve_whatsapp_booking(
    db: Session,
    *,
    tenant: Tenant,
    phone: str,
    service_id: int,
    starts_at: datetime,
    customer_name: str | None = None,
    external_ref_prefix: str = "wa",
) -> tuple[Booking, Service]:
    return reserve_channel_booking(
        db,
        tenant=tenant,
        external_id=phone,
        channel="whatsapp",
        service_id=service_id,
        starts_at=starts_at,
        customer_name=customer_name,
        external_ref_prefix=external_ref_prefix,
    )


def reserve_summary(booking: Booking, service: Service) -> dict:
    due = amount_due(booking)
    return {
        "ok": True,
        "booking_id": booking.id,
        "payment_url": booking.payment_url,
        "amount_due": float(due),
        "currency": booking.currency,
        "service_name": service.name,
        "when": booking.notes,
    }
