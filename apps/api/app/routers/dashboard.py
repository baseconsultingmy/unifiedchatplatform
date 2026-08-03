from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Booking, BookingStatus, Conversation, Customer, Service, User
from app.schemas import DashboardOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardOut:
    tenant_id = user.tenant_id
    today = datetime.now(timezone.utc).date()

    bookings_total = db.query(func.count(Booking.id)).filter(Booking.tenant_id == tenant_id).scalar() or 0
    bookings_confirmed = (
        db.query(func.count(Booking.id))
        .filter(Booking.tenant_id == tenant_id, Booking.status == BookingStatus.confirmed)
        .scalar()
        or 0
    )
    bookings_today = (
        db.query(func.count(Booking.id))
        .filter(Booking.tenant_id == tenant_id, func.date(Booking.starts_at) == today)
        .scalar()
        or 0
    )
    open_conversations = (
        db.query(func.count(Conversation.id))
        .filter(Conversation.tenant_id == tenant_id, Conversation.status == "open")
        .scalar()
        or 0
    )
    services_active = (
        db.query(func.count(Service.id))
        .filter(Service.tenant_id == tenant_id, Service.is_active.is_(True))
        .scalar()
        or 0
    )
    customers_total = (
        db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
    )

    return DashboardOut(
        bookings_total=bookings_total,
        bookings_confirmed=bookings_confirmed,
        bookings_today=bookings_today,
        open_conversations=open_conversations,
        services_active=services_active,
        customers_total=customers_total,
    )
