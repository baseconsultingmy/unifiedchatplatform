from sqlalchemy.orm import Session

from app.config import settings
from app.models import Service, Tenant, User, UserRole
from app.security import hash_password


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned or "vendor"


def bootstrap(db: Session) -> None:
    platform = db.query(Tenant).filter(Tenant.slug == "baseapp-platform").first()
    if platform is None:
        platform = Tenant(
            name="BaseApp Platform",
            slug="baseapp-platform",
            industry="platform",
            timezone="Asia/Kuala_Lumpur",
            country="MY",
            is_platform=True,
        )
        db.add(platform)
        db.flush()

    platform_admin = db.query(User).filter(User.email == settings.bootstrap_admin_email).first()
    if platform_admin is None:
        db.add(
            User(
                tenant_id=platform.id,
                email=settings.bootstrap_admin_email,
                full_name="BaseApp Master Admin",
                password_hash=hash_password(settings.bootstrap_admin_password),
                role=UserRole.platform_admin.value,
            )
        )
    else:
        platform_admin.tenant_id = platform.id
        platform_admin.role = UserRole.platform_admin.value
        platform_admin.full_name = platform_admin.full_name or "BaseApp Master Admin"

    # Sample vendor so Master Admin can see a shop immediately.
    vendor = db.query(Tenant).filter(Tenant.slug == "demo-studio").first()
    if vendor is None:
        vendor = Tenant(
            name=settings.bootstrap_tenant_name,
            slug="demo-studio",
            industry="health_beauty",
            timezone="Asia/Kuala_Lumpur",
            country="MY",
            is_platform=False,
        )
        db.add(vendor)
        db.flush()
    elif vendor.industry in {"wellness", "beauty", "spa"}:
        vendor.industry = "health_beauty"

    vendor_owner_email = "owner@demo-studio.baseapp.asia"
    vendor_owner = db.query(User).filter(User.email == vendor_owner_email).first()
    if vendor_owner is None:
        db.add(
            User(
                tenant_id=vendor.id,
                email=vendor_owner_email,
                full_name="Demo Studio Owner",
                password_hash=hash_password(settings.bootstrap_admin_password),
                role=UserRole.owner.value,
            )
        )

    if db.query(Service).filter(Service.tenant_id == vendor.id).count() == 0:
        db.add_all(
            [
                Service(
                    tenant_id=vendor.id,
                    name="Signature Massage 60m",
                    description="Relaxation massage for first-time guests.",
                    duration_minutes=60,
                    price_amount=120,
                    deposit_amount=30,
                    currency="MYR",
                    category="Treatments",
                ),
                Service(
                    tenant_id=vendor.id,
                    name="Deep Tissue 90m",
                    description="Therapeutic deep tissue session.",
                    duration_minutes=90,
                    price_amount=180,
                    deposit_amount=50,
                    currency="MYR",
                    category="Treatments",
                ),
                Service(
                    tenant_id=vendor.id,
                    name="Small Tattoo Session",
                    description="Up to 2 hours flash / small custom work.",
                    duration_minutes=120,
                    price_amount=250,
                    deposit_amount=80,
                    currency="MYR",
                    category="Tattoo",
                ),
            ]
        )
    else:
        # Backfill categories for demo catalog when missing.
        for svc in db.query(Service).filter(Service.tenant_id == vendor.id, Service.category.is_(None)):
            lowered = (svc.name or "").lower()
            if "tattoo" in lowered:
                svc.category = "Tattoo"
            elif "massage" in lowered or "tissue" in lowered:
                svc.category = "Treatments"
            else:
                svc.category = "General"

    db.commit()
