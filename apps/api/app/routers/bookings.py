from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Booking, Customer, Service, User
from app.payments import attach_payment_link
from app.schemas import BookingIn, BookingOut, BookingUpdate

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.get("", response_model=list[BookingOut])
def list_bookings(
    user: User = Depends(require_vendor_user), db: Session = Depends(get_db)
) -> list[Booking]:
    return (
        db.query(Booking)
        .options(joinedload(Booking.customer), joinedload(Booking.service))
        .filter(Booking.tenant_id == user.tenant_id)
        .order_by(Booking.id.desc())
        .all()
    )


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
