from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Booking, Customer, Resource, Service, User
from app.payments import attach_payment_link
from app.schemas import BookingIn, BookingOut, BookingUpdate

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _booking_query(db: Session):
    return db.query(Booking).options(
        joinedload(Booking.customer),
        joinedload(Booking.service),
        joinedload(Booking.room),
        joinedload(Booking.person),
    )


def _validate_resource(
    db: Session,
    *,
    tenant_id: int,
    resource_id: int | None,
    expected_kind: str,
    label: str,
) -> None:
    if resource_id is None:
        return
    resource = (
        db.query(Resource)
        .filter(
            Resource.id == resource_id,
            Resource.tenant_id == tenant_id,
            Resource.kind == expected_kind,
            Resource.is_active.is_(True),
        )
        .first()
    )
    if resource is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")


@router.get("", response_model=list[BookingOut])
def list_bookings(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
    from_at: datetime | None = Query(default=None, alias="from"),
    to_at: datetime | None = Query(default=None, alias="to"),
) -> list[Booking]:
    q = _booking_query(db).filter(Booking.tenant_id == user.tenant_id)
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

    _validate_resource(
        db, tenant_id=user.tenant_id, resource_id=payload.room_id, expected_kind="room", label="Room"
    )
    _validate_resource(
        db,
        tenant_id=user.tenant_id,
        resource_id=payload.person_id,
        expected_kind="person",
        label="Person",
    )

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
    return _booking_query(db).filter(Booking.id == booking.id).one()


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

    data = payload.model_dump(exclude_unset=True)
    if "room_id" in data:
        _validate_resource(
            db,
            tenant_id=user.tenant_id,
            resource_id=data["room_id"],
            expected_kind="room",
            label="Room",
        )
    if "person_id" in data:
        _validate_resource(
            db,
            tenant_id=user.tenant_id,
            resource_id=data["person_id"],
            expected_kind="person",
            label="Person",
        )

    for key, value in data.items():
        setattr(booking, key, value)
    db.commit()
    return _booking_query(db).filter(Booking.id == booking.id).one()
