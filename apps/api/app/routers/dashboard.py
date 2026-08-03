from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Booking, BookingStatus, Conversation, Customer, Service, Tenant, User, UserRole
from app.schemas import DashboardOut, PlatformDashboardOut

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut | PlatformDashboardOut)
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == UserRole.platform_admin.value:
        vendors_total = (
            db.query(func.count(Tenant.id)).filter(Tenant.is_platform.is_(False)).scalar() or 0
        )
        vendors_active = (
            db.query(func.count(Tenant.id))
            .filter(Tenant.is_platform.is_(False), Tenant.is_active.is_(True))
            .scalar()
            or 0
        )
        return PlatformDashboardOut(
            vendors_total=vendors_total,
            vendors_active=vendors_active,
            bookings_total=db.query(func.count(Booking.id)).scalar() or 0,
            open_conversations=(
                db.query(func.count(Conversation.id))
                .filter(Conversation.status == "open")
                .scalar()
                or 0
            ),
            customers_total=db.query(func.count(Customer.id)).scalar() or 0,
        )

    tenant_id = user.tenant_id
    today = datetime.now(timezone.utc).date()
    return DashboardOut(
        bookings_total=db.query(func.count(Booking.id))
        .filter(Booking.tenant_id == tenant_id)
        .scalar()
        or 0,
        bookings_confirmed=(
            db.query(func.count(Booking.id))
            .filter(Booking.tenant_id == tenant_id, Booking.status == BookingStatus.confirmed)
            .scalar()
            or 0
        ),
        bookings_today=(
            db.query(func.count(Booking.id))
            .filter(Booking.tenant_id == tenant_id, func.date(Booking.starts_at) == today)
            .scalar()
            or 0
        ),
        open_conversations=(
            db.query(func.count(Conversation.id))
            .filter(Conversation.tenant_id == tenant_id, Conversation.status == "open")
            .scalar()
            or 0
        ),
        services_active=(
            db.query(func.count(Service.id))
            .filter(Service.tenant_id == tenant_id, Service.is_active.is_(True))
            .scalar()
            or 0
        ),
        customers_total=(
            db.query(func.count(Customer.id)).filter(Customer.tenant_id == tenant_id).scalar() or 0
        ),
        role=user.role,
        is_platform_admin=False,
    )
