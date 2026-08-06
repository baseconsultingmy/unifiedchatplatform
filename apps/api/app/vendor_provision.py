"""Shared vendor tenant + owner creation (Master Admin and social signup)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.currency import normalize_country, timezone_for_country
from app.models import Tenant, User, UserRole
from app.routers.workspace import normalize_industry
from app.security import hash_password
from app.seed import slugify
from app.whatsapp_creds import refresh_whatsapp_status


def unique_slug(db: Session, base: str) -> str:
    root = slugify(base)
    slug = root
    n = 2
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{root}-{n}"
        n += 1
    return slug


def provision_vendor(
    db: Session,
    *,
    name: str,
    industry: str,
    owner_email: str,
    owner_full_name: str,
    owner_password: str | None = None,
    auth_provider: str = "password",
    google_sub: str | None = None,
    timezone: str | None = None,
    country: str = "MY",
    slug: str | None = None,
) -> tuple[Tenant, User]:
    email = owner_email.strip().lower()
    shop = name.strip()
    if not shop:
        raise ValueError("Shop name is required")
    if not email:
        raise ValueError("Owner email is required")
    if db.query(User).filter(User.email == email).first():
        raise ValueError("Owner email already exists")
    if google_sub and db.query(User).filter(User.google_sub == google_sub).first():
        raise ValueError("This Google account is already linked")

    country_code = normalize_country(country)
    tz = (timezone or "").strip() or timezone_for_country(country_code)
    tenant = Tenant(
        name=shop,
        slug=unique_slug(db, slug or shop),
        industry=normalize_industry(industry),
        timezone=tz,
        country=country_code,
        is_platform=False,
        is_active=True,
    )
    refresh_whatsapp_status(tenant)
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        email=email,
        full_name=(owner_full_name or email.split("@")[0]).strip()[:120],
        password_hash=hash_password(owner_password) if owner_password else None,
        role=UserRole.owner.value,
        auth_provider=auth_provider,
        google_sub=google_sub,
    )
    db.add(user)
    db.flush()
    return tenant, user
