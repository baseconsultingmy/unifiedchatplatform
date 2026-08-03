from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Tenant, User
from app.schemas import TenantOut, WorkspaceUpdateIn

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
    for key, value in data.items():
        setattr(tenant, key, value)
    db.commit()
    db.refresh(tenant)
    return tenant
