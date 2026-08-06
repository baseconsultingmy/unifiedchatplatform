from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_platform_admin
from app.grab_client import grab_configured
from app.grab_creds import apply_grab_fields
from app.line_creds import apply_line_fields
from app.models import Booking, Service, Tenant, User, UserRole
from app.routers.workspace import normalize_industry
from app.schemas import PlatformMetaOut, TokenOut, VendorCreateIn, VendorOut, VendorUpdateIn
from app.security import create_access_token
from app.config import settings
from app.flow_crypto import is_flow_crypto_configured, normalize_public_key_pem
from app.flow_meta import FlowMetaError, ensure_booking_flow_published
from app.seed import slugify
from app.vendor_provision import provision_vendor
from app.whatsapp_creds import apply_whatsapp_fields, refresh_whatsapp_status

router = APIRouter(prefix="/vendors", tags=["vendors"])


def _ensure_unique_phone_id(db: Session, phone_id: str | None, *, exclude_id: int | None = None) -> None:
    if not phone_id:
        return
    q = db.query(Tenant).filter(
        Tenant.wa_phone_number_id == phone_id,
        Tenant.is_platform.is_(False),
    )
    if exclude_id is not None:
        q = q.filter(Tenant.id != exclude_id)
    if q.first():
        raise HTTPException(
            status_code=400,
            detail="Another vendor already uses this WhatsApp phone number ID",
        )


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
        wa_business_account_id=tenant.wa_business_account_id,
        wa_flow_id=tenant.wa_flow_id,
        wa_display_phone=tenant.wa_display_phone,
        wa_verify_token=tenant.wa_verify_token,
        wa_webhook_status=tenant.wa_webhook_status or "not_configured",
        wa_connected_at=tenant.wa_connected_at,
        wa_access_token_set=bool(tenant.wa_access_token),
        line_channel_id=tenant.line_channel_id,
        line_channel_secret_set=bool(tenant.line_channel_secret),
        line_channel_access_token_set=bool(tenant.line_channel_access_token),
        line_webhook_status=tenant.line_webhook_status or "not_configured",
        line_connected_at=tenant.line_connected_at,
        grab_merchant_id=tenant.grab_merchant_id,
        grab_markup_percent=float(tenant.grab_markup_percent or 30),
        grab_sync_status=tenant.grab_sync_status or "not_configured",
        grab_last_synced_at=tenant.grab_last_synced_at,
        grab_activation_url=tenant.grab_activation_url,
        grab_partner_token_set=bool(tenant.grab_partner_token),
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


@router.get("/meta", response_model=PlatformMetaOut)
def platform_meta_overview(
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> PlatformMetaOut:
    """Platform-level Meta defaults + how many shops have WhatsApp wired."""
    vendors = db.query(Tenant).filter(Tenant.is_platform.is_(False)).all()
    with_phone = sum(1 for t in vendors if (t.wa_phone_number_id or "").strip())
    with_token = sum(1 for t in vendors if (t.wa_access_token or "").strip())
    with_flow = sum(1 for t in vendors if (t.wa_flow_id or "").strip())
    verified = sum(1 for t in vendors if (t.wa_webhook_status or "") == "verified")
    with_grab = sum(
        1
        for t in vendors
        if (t.grab_merchant_id or "").strip()
        or (t.grab_sync_status or "") not in ("", "not_configured")
    )
    crypto_ok = is_flow_crypto_configured(settings.wa_flow_private_key)
    notes = [
        "Per-vendor Phone number ID + access token are set on each row via Meta setup (or by the merchant under Settings).",
        "Booking uses native WhatsApp Flows (in-chat). Paste WABA ID, then Publish booking Flow.",
        "WA_APP_SECRET, WA_VERIFY_TOKEN, and WA_FLOW_PRIVATE_KEY live in deploy/.env.",
        "Platform META_ACCESS_TOKEN / META_PHONE_NUMBER_ID are fallback only; prefer shop-owned credentials.",
    ]
    if not settings.wa_app_secret:
        notes.append("WA_APP_SECRET is empty — webhook signature checks are disabled.")
    if not settings.meta_access_token:
        notes.append("No platform fallback access token is configured.")
    if not crypto_ok:
        notes.append("WA_FLOW_PRIVATE_KEY missing — Flows data endpoint cannot decrypt Meta requests.")
    if not grab_configured():
        notes.append("GRAB_CLIENT_ID / GRAB_CLIENT_SECRET unset — Grab Connect / Publish run in dry-run.")
    return PlatformMetaOut(
        webhook_url=f"{settings.public_api_base.rstrip('/')}/v1/webhooks/whatsapp",
        flows_endpoint_url=f"{settings.public_api_base.rstrip('/')}/v1/webhooks/whatsapp/flows",
        platform_verify_token=settings.wa_verify_token,
        app_secret_set=bool(settings.wa_app_secret),
        platform_access_token_set=bool(settings.meta_access_token),
        platform_phone_number_id=(settings.meta_phone_number_id or "").strip() or None,
        flow_crypto_configured=crypto_ok,
        grab_credentials_set=grab_configured(),
        vendors_with_phone_id=with_phone,
        vendors_with_token=with_token,
        vendors_with_flow=with_flow,
        vendors_verified=verified,
        vendors_with_grab=with_grab,
        notes=notes,
    )


@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
def create_vendor(
    payload: VendorCreateIn,
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> VendorOut:
    desired_slug = slugify(payload.slug or payload.name)
    if db.query(Tenant).filter(Tenant.slug == desired_slug).first():
        raise HTTPException(status_code=400, detail="Vendor slug already exists")
    if db.query(User).filter(User.email == str(payload.owner_email).strip().lower()).first():
        raise HTTPException(status_code=400, detail="Owner email already exists")

    _ensure_unique_phone_id(db, payload.wa_phone_number_id)

    try:
        tenant, _owner = provision_vendor(
            db,
            name=payload.name,
            industry=payload.industry,
            owner_email=str(payload.owner_email),
            owner_full_name=payload.owner_full_name,
            owner_password=payload.owner_password,
            auth_provider="password",
            timezone=payload.timezone,
            country=payload.country,
            slug=desired_slug,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    tenant.wa_phone_number_id = (payload.wa_phone_number_id or "").strip() or None
    tenant.wa_access_token = (payload.wa_access_token or "").strip() or None
    tenant.wa_business_account_id = (payload.wa_business_account_id or "").strip() or None
    tenant.wa_display_phone = (payload.wa_display_phone or "").strip() or None
    tenant.wa_verify_token = (payload.wa_verify_token or "").strip() or None
    refresh_whatsapp_status(tenant)
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
        # Keep timezone aligned with market unless caller also patches timezone.
        if "timezone" not in data:
            from app.currency import timezone_for_country

            data["timezone"] = timezone_for_country(data["country"])
    if "industry" in data and data["industry"]:
        data["industry"] = normalize_industry(data["industry"])
    if "wa_phone_number_id" in data:
        _ensure_unique_phone_id(db, data.get("wa_phone_number_id"), exclude_id=tenant.id)

    apply_whatsapp_fields(tenant, data)
    apply_grab_fields(tenant, data)
    apply_line_fields(tenant, data)
    for key, value in data.items():
        setattr(tenant, key, value)

    # Align catalog currency with shop country when country changes.
    if "country" in payload.model_dump(exclude_unset=True):
        from app.currency import tenant_currency
        from app.models import Service

        code = tenant_currency(tenant)
        (
            db.query(Service)
            .filter(Service.tenant_id == tenant.id)
            .update({Service.currency: code}, synchronize_session=False)
        )

    db.commit()
    db.refresh(tenant)
    return _vendor_out(db, tenant)


@router.post("/{vendor_id}/grab/connect", response_model=VendorOut)
async def connect_vendor_grab(
    vendor_id: int,
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> VendorOut:
    """Master Admin: start Grab self-serve activation for a vendor."""
    from app import grab_client

    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == vendor_id, Tenant.is_platform.is_(False))
        .first()
    )
    if tenant is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    result = await grab_client.create_self_serve_activation(partner_merchant_id=tenant.slug)
    if not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=result.get("detail") or "Could not start Grab activation",
        )
    tenant.grab_activation_url = result.get("activation_url")
    if not (tenant.grab_merchant_id or "").strip():
        tenant.grab_merchant_id = tenant.slug
    if tenant.grab_sync_status in (None, "", "not_configured"):
        tenant.grab_sync_status = "activation_pending"
    db.commit()
    db.refresh(tenant)
    return _vendor_out(db, tenant)


@router.post("/{vendor_id}/publish-flow", response_model=VendorOut)
def publish_vendor_booking_flow(
    vendor_id: int,
    _: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> VendorOut:
    """Create/upload/publish the in-chat booking Flow for this shop and save wa_flow_id."""
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == vendor_id, Tenant.is_platform.is_(False))
        .first()
    )
    if tenant is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if not (tenant.wa_business_account_id or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Set WhatsApp Business Account ID (WABA) first, then publish the Flow",
        )
    if not is_flow_crypto_configured(settings.wa_flow_private_key):
        raise HTTPException(
            status_code=503,
            detail="Server missing WA_FLOW_PRIVATE_KEY — cannot host Flows endpoint",
        )

    public_pem = normalize_public_key_pem(settings.wa_flow_public_key)

    try:
        steps = ensure_booking_flow_published(
            tenant,
            public_key_pem=public_pem or None,
        )
    except FlowMetaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    flow_id = str(steps.get("flow_id") or "").strip()
    if not flow_id:
        raise HTTPException(status_code=400, detail="Meta did not return a Flow ID")

    tenant.wa_flow_id = flow_id
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
