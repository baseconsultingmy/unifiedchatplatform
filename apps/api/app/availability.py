from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Tenant

# Customer-facing booking window (local shop time).
OPEN_HOUR = 10
CLOSE_HOUR = 20
SLOT_STEP_MINUTES = 30
DATE_OPTIONS = 14


def tenant_tz(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone or "Asia/Kuala_Lumpur")
    except Exception:
        return ZoneInfo("Asia/Kuala_Lumpur")


ACTIVE_BOOKING_STATUSES = (
    BookingStatus.inquiry,
    BookingStatus.held,
    BookingStatus.confirmed,
    BookingStatus.completed,
)


def busy_bookings(
    db: Session,
    tenant_id: int,
    range_start_utc: datetime,
    range_end_utc: datetime,
) -> list[Booking]:
    return (
        db.query(Booking)
        .filter(
            Booking.tenant_id == tenant_id,
            Booking.starts_at.is_not(None),
            Booking.ends_at.is_not(None),
            Booking.status.in_([BookingStatus.held, BookingStatus.confirmed]),
            Booking.starts_at < range_end_utc,
            Booking.ends_at > range_start_utc,
        )
        .all()
    )


def slot_conflicts(starts: datetime, ends: datetime, busy: list[Booking]) -> bool:
    for b in busy:
        if b.starts_at is None or b.ends_at is None:
            continue
        if starts < b.ends_at and ends > b.starts_at:
            return True
    return False


def intervals_overlap(
    starts_a: datetime,
    ends_a: datetime,
    starts_b: datetime,
    ends_b: datetime,
) -> bool:
    return starts_a < ends_b and ends_a > starts_b


def resource_conflicts(
    db: Session,
    *,
    tenant_id: int,
    starts_at: datetime,
    ends_at: datetime,
    person_id: int | None = None,
    room_id: int | None = None,
    exclude_booking_id: int | None = None,
) -> list[Booking]:
    """Return active bookings that clash with person and/or room in this window."""
    if person_id is None and room_id is None:
        return []
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    if ends_at.tzinfo is None:
        ends_at = ends_at.replace(tzinfo=timezone.utc)
    if ends_at <= starts_at:
        return []

    q = db.query(Booking).filter(
        Booking.tenant_id == tenant_id,
        Booking.starts_at.is_not(None),
        Booking.ends_at.is_not(None),
        Booking.status.in_(list(ACTIVE_BOOKING_STATUSES)),
        Booking.starts_at < ends_at,
        Booking.ends_at > starts_at,
    )
    if exclude_booking_id is not None:
        q = q.filter(Booking.id != exclude_booking_id)

    clauses = []
    if person_id is not None:
        clauses.append(Booking.person_id == person_id)
    if room_id is not None:
        clauses.append(Booking.room_id == room_id)
    if not clauses:
        return []

    return q.filter(or_(*clauses)).all()


def available_slots(
    db: Session,
    tenant: Tenant,
    *,
    day: date,
    duration_minutes: int,
) -> list[datetime]:
    """Return available local-time slot starts for a shop day (never includes taken/past)."""
    tz = tenant_tz(tenant)
    now_local = datetime.now(tz)
    day_start_local = datetime(day.year, day.month, day.day, OPEN_HOUR, 0, tzinfo=tz)
    day_end_local = datetime(day.year, day.month, day.day, CLOSE_HOUR, 0, tzinfo=tz)
    busy = busy_bookings(
        db,
        tenant.id,
        day_start_local.astimezone(timezone.utc),
        day_end_local.astimezone(timezone.utc),
    )

    duration = max(int(duration_minutes or 60), SLOT_STEP_MINUTES)
    slots: list[datetime] = []
    cursor = day_start_local
    while cursor + timedelta(minutes=duration) <= day_end_local:
        ends = cursor + timedelta(minutes=duration)
        if cursor > now_local + timedelta(minutes=5) and not slot_conflicts(
            cursor.astimezone(timezone.utc),
            ends.astimezone(timezone.utc),
            busy,
        ):
            slots.append(cursor)
        cursor += timedelta(minutes=SLOT_STEP_MINUTES)
    return slots


def dates_with_availability(
    db: Session,
    tenant: Tenant,
    *,
    duration_minutes: int,
    days: int = DATE_OPTIONS,
) -> list[date]:
    """Only return dates that have at least one open slot."""
    tz = tenant_tz(tenant)
    today = datetime.now(tz).date()
    out: list[date] = []
    for offset in range(max(1, days)):
        day = today + timedelta(days=offset)
        if available_slots(db, tenant, day=day, duration_minutes=duration_minutes):
            out.append(day)
    return out


def date_label(day: date, today: date) -> str:
    if day == today:
        return "Today"
    if day == today + timedelta(days=1):
        return "Tomorrow"
    return day.strftime("%a %d %b")
