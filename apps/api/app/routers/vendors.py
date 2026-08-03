from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_platform_admin
from app.models import Booking, Service, Tenant, User, UserRole
from app.schemas import TokenOut, VendorCreateIn, VendorOut, VendorUpdateIn
from app.security import create_access_token, hash_password
from app.seed import slugify

router = APIRouter(prefix="/vendors", tags=["vendors"])


def _vendor_out(db: Session, tenant: Tenant) -> VendorOut:
    owner = (
        db.query(User)
        .filter(User.tenant_id == tenant.id, User.role == UserRole.owner.value)
        .order_by(User.id.asc())
        .first()
    )
    services_count = (
        db.query(func.count(Service.id)).filter(Service.tenant_id == tenant.id).scalar() or 0
    )
    bookings_count = (
        db.query(func.count(Booking.id)).filter(Booking.tenant_id == tenant.id).scalar() or 0
    )
    return VendorOut(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        industry=tenant.industry,
        timezone=tenant.timezone,
        country=tenant.country,
        is_active=tenant.is_active,
        wa_phone_number_id=tenant.wa_phone_number_id,
        line_channel_id=tenant.line_channel_id,
        created_at=tenant.created_at,
        owner_email=owner.email if owner else None,
        owner_name=owner.full_name if owner else None,
        services_count=services_count,
        bookings_count=bookings_count,
    )


@router.get("", response_model=list[VendorOut])
def list_vendors(
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[VendorOut]:
    tenants = (
        db.query(Tenant)
        .filter(Tenant.is_platform.is_(False))
        .order_by(Tenant.id.desc())
        .all()
    )
    return [_vendor_out(db, t) for t in tenants]


@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
def create_vendor(
    payload: VendorCreateIn,
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> VendorOut:
    slug = slugify(payload.slug or payload.name)
    if db.query(Tenant).filter(Tenant.slug == slug).first():
        raise HTTPException(status_code=400, detail="Vendor slug already exists")
    if db.query(User).filter(User.email == payload.owner_email).first():
        raise HTTPException(status_code=400, detail="Owner email already exists")

    tenant = Tenant(
        name=payload.name,
        slug=slug,
        industry=payload.industry,
        timezone=payload.timezone,
        country=payload.country.upper(),
        is_platform=False,
        is_active=True,
        wa_phone_number_id=payload.wa_phone_number_id,
    )
    db.add(tenant)
    db.flush()

    db.add(
        User(
            tenant_id=tenant.id,
            email=payload.owner_email,
            full_name=payload.owner_full_name,
            password_hash=hash_password(payload.owner_password),
            role=UserRole.owner.value,
        )
    )
    db.commit()
    db.refresh(tenant)
    return _vendor_out(db, tenant)


@router.patch("/{vendor_id}", response_model=VendorOut)
def update_vendor(
    vendor_id: int,
    payload: VendorUpdateIn,
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> VendorOut:
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == vendor_id, Tenant.is_platform.is_(False))
        .first()
    )
    if tenant is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    data = payload.model_dump(exclude_unset=True)
    if "country" in data and data["country"]:
        data["country"] = data["country"].upper()
    for key, value in data.items():
        setattr(tenant, key, value)
    db.commit()
    db.refresh(tenant)
    return _vendor_out(db, tenant)


@router.post("/{vendor_id}/view-as", response_model=TokenOut)
def view_as_vendor(
    vendor_id: int,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> TokenOut:
    """Issue a short-lived vendor-owner token so Master Admin can inspect a shop."""
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == vendor_id, Tenant.is_platform.is_(False))
        .first()
    )
    if tenant is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if not tenant.is_active:
        raise HTTPException(status_code=400, detail="Vendor is disabled")

    owner = (
        db.query(User)
        .filter(
            User.tenant_id == tenant.id,
            User.role == UserRole.owner.value,
            User.is_active.is_(True),
        )
        .order_by(User.id.asc())
        .first()
    )
    if owner is None:
        raise HTTPException(status_code=400, detail="Vendor has no active owner login")

    token = create_access_token(
        user_id=owner.id,
        tenant_id=tenant.id,
        email=owner.email,
        impersonator_id=admin.id,
        expire_minutes=60 * 4,
    )
    return TokenOut(access_token=token, impersonating=True, vendor_name=tenant.name)
