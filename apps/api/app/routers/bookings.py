from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.availability import resource_conflicts
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


def _window_for_booking(
    *,
    starts_at: datetime | None,
    ends_at: datetime | None,
    service: Service | None,
) -> tuple[datetime, datetime] | None:
    if starts_at is None:
        return None
    starts = starts_at if starts_at.tzinfo else starts_at.replace(tzinfo=timezone.utc)
    if ends_at is not None:
        ends = ends_at if ends_at.tzinfo else ends_at.replace(tzinfo=timezone.utc)
    else:
        mins = int((service.duration_minutes if service else None) or 60)
        ends = starts + timedelta(minutes=mins)
    if ends <= starts:
        return None
    return starts, ends


def _assert_no_resource_clash(
    db: Session,
    *,
    tenant_id: int,
    starts_at: datetime | None,
    ends_at: datetime | None,
    person_id: int | None,
    room_id: int | None,
    service: Service | None = None,
    exclude_booking_id: int | None = None,
) -> None:
    window = _window_for_booking(starts_at=starts_at, ends_at=ends_at, service=service)
    if window is None or (person_id is None and room_id is None):
        return
    starts, ends = window
    clashes = resource_conflicts(
        db,
        tenant_id=tenant_id,
        starts_at=starts,
        ends_at=ends,
        person_id=person_id,
        room_id=room_id,
        exclude_booking_id=exclude_booking_id,
    )
    if not clashes:
        return

    person_hit = next((c for c in clashes if person_id and c.person_id == person_id), None)
    room_hit = next((c for c in clashes if room_id and c.room_id == room_id), None)
    if person_hit and room_hit:
        raise HTTPException(
            status_code=409,
            detail="That staff member and room are already booked for this time",
        )
    if person_hit:
        raise HTTPException(
            status_code=409,
            detail="That staff member is already booked for this time",
        )
    raise HTTPException(
        status_code=409,
        detail="That room is already booked for this time",
    )


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

    _assert_no_resource_clash(
        db,
        tenant_id=user.tenant_id,
        starts_at=data.get("starts_at"),
        ends_at=data.get("ends_at"),
        person_id=data.get("person_id"),
        room_id=data.get("room_id"),
        service=service,
    )

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

    next_person = data["person_id"] if "person_id" in data else booking.person_id
    next_room = data["room_id"] if "room_id" in data else booking.room_id
    next_starts = data["starts_at"] if "starts_at" in data else booking.starts_at
    next_ends = data["ends_at"] if "ends_at" in data else booking.ends_at
    service = None
    service_id = data["service_id"] if "service_id" in data else booking.service_id
    if service_id is not None:
        service = (
            db.query(Service)
            .filter(Service.id == service_id, Service.tenant_id == user.tenant_id)
            .first()
        )
    if next_starts is not None and next_ends is None and service is not None:
        starts = next_starts if next_starts.tzinfo else next_starts.replace(tzinfo=timezone.utc)
        next_ends = starts + timedelta(minutes=int(service.duration_minutes or 60))
        data["ends_at"] = next_ends

    _assert_no_resource_clash(
        db,
        tenant_id=user.tenant_id,
        starts_at=next_starts,
        ends_at=next_ends,
        person_id=next_person,
        room_id=next_room,
        service=service,
        exclude_booking_id=booking.id,
    )

    for key, value in data.items():
        setattr(booking, key, value)

    # Stamp paid_at when payment flips to a paid state (cash complete, mark paid, etc.)
    next_payment = getattr(booking.payment_status, "value", booking.payment_status)
    if next_payment in {"paid", "deposit_paid"} and booking.paid_at is None:
        booking.paid_at = datetime.now(timezone.utc)

    db.commit()
    return _booking_query(db).filter(Booking.id == booking.id).one()
