from sqlalchemy.orm import Session

from app.config import settings
from app.models import Service, Tenant, User
from app.security import hash_password


def slugify(value: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")


def bootstrap(db: Session) -> None:
    tenant = db.query(Tenant).filter(Tenant.slug == "demo-studio").first()
    if tenant is None:
        tenant = Tenant(
            name=settings.bootstrap_tenant_name,
            slug="demo-studio",
            industry="wellness",
            timezone="Asia/Kuala_Lumpur",
            country="MY",
        )
        db.add(tenant)
        db.flush()

    admin = (
        db.query(User)
        .filter(User.tenant_id == tenant.id, User.email == settings.bootstrap_admin_email)
        .first()
    )
    if admin is None:
        db.add(
            User(
                tenant_id=tenant.id,
                email=settings.bootstrap_admin_email,
                full_name="BaseApp Admin",
                password_hash=hash_password(settings.bootstrap_admin_password),
                role="owner",
            )
        )

    if db.query(Service).filter(Service.tenant_id == tenant.id).count() == 0:
        db.add_all(
            [
                Service(
                    tenant_id=tenant.id,
                    name="Signature Massage 60m",
                    description="Relaxation massage for first-time guests.",
                    duration_minutes=60,
                    price_amount=120,
                    deposit_amount=30,
                    currency="MYR",
                ),
                Service(
                    tenant_id=tenant.id,
                    name="Deep Tissue 90m",
                    description="Therapeutic deep tissue session.",
                    duration_minutes=90,
                    price_amount=180,
                    deposit_amount=50,
                    currency="MYR",
                ),
                Service(
                    tenant_id=tenant.id,
                    name="Small Tattoo Session",
                    description="Up to 2 hours flash / small custom work.",
                    duration_minutes=120,
                    price_amount=250,
                    deposit_amount=80,
                    currency="MYR",
                ),
            ]
        )

    db.commit()
