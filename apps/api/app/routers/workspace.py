from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import require_vendor_user
from app.flow_crypto import is_flow_crypto_configured
from app.models import Tenant, User
from app.schemas import TenantOut, WhatsAppSetupOut, WorkspaceUpdateIn
from app.whatsapp_creds import apply_whatsapp_fields, resolve_verify_token, resolve_whatsapp_credentials

router = APIRouter(prefix="/workspace", tags=["workspace"])

ALLOWED_INDUSTRIES = {
    "health_beauty",
    "fnb",
    "retail",
    "general",
    # legacy aliases accepted on write, normalized below
    "wellness",
    "beauty",
    "food",
}


def normalize_industry(value: str) -> str:
    raw = (value or "general").strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "wellness": "health_beauty",
        "beauty": "health_beauty",
        "spa": "health_beauty",
        "salon": "health_beauty",
        "tattoo": "health_beauty",
        "food": "fnb",
        "food_beverage": "fnb",
        "fb": "fnb",
        "kiosk": "fnb",
        "shop": "retail",
    }
    mapped = aliases.get(raw, raw)
    if mapped not in {"health_beauty", "fnb", "retail", "general"}:
        raise HTTPException(status_code=400, detail="Unsupported industry")
    return mapped


def _ensure_unique_phone_id(db: Session, phone_id: str | None, *, exclude_id: int) -> None:
    if not phone_id:
        return
    clash = (
        db.query(Tenant)
        .filter(
            Tenant.wa_phone_number_id == phone_id,
            Tenant.is_platform.is_(False),
            Tenant.id != exclude_id,
        )
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=400,
            detail="Another shop already uses this WhatsApp phone number ID",
        )


@router.get("", response_model=TenantOut)
def get_workspace(user: User = Depends(require_vendor_user), db: Session = Depends(get_db)) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return tenant


@router.patch("", response_model=TenantOut)
def update_workspace(
    payload: WorkspaceUpdateIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    data = payload.model_dump(exclude_unset=True)
    if "industry" in data and data["industry"] is not None:
        data["industry"] = normalize_industry(data["industry"])
    if "wa_phone_number_id" in data:
        _ensure_unique_phone_id(db, data.get("wa_phone_number_id"), exclude_id=tenant.id)

    apply_whatsapp_fields(tenant, data)
    for key, value in data.items():
        setattr(tenant, key, value)
    db.commit()
    db.refresh(tenant)
    return tenant


@router.get("/whatsapp", response_model=WhatsAppSetupOut)
def get_whatsapp_setup(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> WhatsAppSetupOut:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    token, phone_id = resolve_whatsapp_credentials(tenant)
    using_fallback = bool(
        (not (tenant.wa_access_token or "").strip() and settings.meta_access_token)
        or (not (tenant.wa_phone_number_id or "").strip() and settings.meta_phone_number_id)
    )
    verify = resolve_verify_token(tenant)
    crypto_ok = is_flow_crypto_configured(settings.wa_flow_private_key)
    notes = [
        "In Meta Developer → your WhatsApp app → Configuration, set the callback URL and verify token below.",
        "Subscribe to messages webhooks for the phone number used by this shop.",
        "Paste the Phone number ID and a permanent System User access token here so BaseApp can reply and send receipts.",
        "Booking runs as a native WhatsApp Flow (in-chat). Paste your WABA ID; Master Admin publishes the Flow.",
    ]
    if using_fallback:
        notes.append(
            "This shop is currently falling back to the platform Meta credentials. Add shop-owned values to isolate WhatsApp."
        )
    if not token or not phone_id:
        notes.append("WhatsApp sending will stay offline until both Phone number ID and Access token are set.")
    if not (tenant.wa_flow_id or "").strip():
        notes.append("No Flow ID yet — Master Admin must Publish booking Flow after WABA ID is saved.")
    if not crypto_ok:
        notes.append("Server Flows crypto is not configured — in-chat booking endpoint will fail until fixed.")

    return WhatsAppSetupOut(
        webhook_url=f"{settings.public_api_base.rstrip('/')}/v1/webhooks/whatsapp",
        flows_endpoint_url=f"{settings.public_api_base.rstrip('/')}/v1/webhooks/whatsapp/flows",
        verify_token=verify,
        phone_number_id=tenant.wa_phone_number_id,
        display_phone=tenant.wa_display_phone,
        business_account_id=tenant.wa_business_account_id,
        flow_id=tenant.wa_flow_id,
        access_token_set=bool((tenant.wa_access_token or "").strip()),
        webhook_status=tenant.wa_webhook_status or "not_configured",
        connected_at=tenant.wa_connected_at,
        using_platform_fallback=using_fallback,
        flow_crypto_configured=crypto_ok,
        notes=notes,
    )
