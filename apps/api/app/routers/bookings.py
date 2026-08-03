from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Booking, Customer, Service, User
from app.payments import attach_payment_link
from app.schemas import BookingIn, BookingOut, BookingUpdate

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.get("", response_model=list[BookingOut])
def list_bookings(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
    from_at: datetime | None = Query(default=None, alias="from"),
    to_at: datetime | None = Query(default=None, alias="to"),
) -> list[Booking]:
    q = (
        db.query(Booking)
        .options(joinedload(Booking.customer), joinedload(Booking.service))
        .filter(Booking.tenant_id == user.tenant_id)
    )
    if from_at is not None:
        if from_at.tzinfo is None:
            from_at = from_at.replace(tzinfo=timezone.utc)
        q = q.filter(Booking.starts_at.is_not(None), Booking.starts_at >= from_at)
    if to_at is not None:
        if to_at.tzinfo is None:
            to_at = to_at.replace(tzinfo=timezone.utc)
        q = q.filter(Booking.starts_at.is_not(None), Booking.starts_at < to_at)
    return q.order_by(Booking.starts_at.asc().nulls_last(), Booking.id.desc()).all()


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Booking:
    customer = (
        db.query(Customer)
        .filter(Customer.id == payload.customer_id, Customer.tenant_id == user.tenant_id)
        .first()
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    service = None
    if payload.service_id is not None:
        service = (
            db.query(Service)
            .filter(Service.id == payload.service_id, Service.tenant_id == user.tenant_id)
            .first()
        )
        if service is None:
            raise HTTPException(status_code=404, detail="Service not found")

    data = payload.model_dump()
    if service is not None and float(data.get("deposit_amount") or 0) <= 0:
        data["deposit_amount"] = service.deposit_amount or 0
    if data.get("starts_at") and not data.get("ends_at") and service is not None:
        starts = data["starts_at"]
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=timezone.utc)
            data["starts_at"] = starts
        data["ends_at"] = starts + timedelta(minutes=int(service.duration_minutes or 60))

    booking = Booking(tenant_id=user.tenant_id, **data)
    db.add(booking)
    db.flush()
    attach_payment_link(db, booking)
    db.commit()
    db.refresh(booking)
    return (
        db.query(Booking)
        .options(joinedload(Booking.customer), joinedload(Booking.service))
        .filter(Booking.id == booking.id)
        .one()
    )


@router.patch("/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: int,
    payload: BookingUpdate,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Booking:
    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.tenant_id == user.tenant_id)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(booking, key, value)
    db.commit()
    return (
        db.query(Booking)
        .options(joinedload(Booking.customer), joinedload(Booking.service))
        .filter(Booking.id == booking.id)
        .one()
    )
