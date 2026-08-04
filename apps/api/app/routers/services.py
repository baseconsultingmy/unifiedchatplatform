from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_vendor_user
from app.grab_menu import channel_price_map
from app.models import Service, ServiceChannelPrice, Tenant, User
from app.pricing import grab_price_for_service
from app.schemas import GrabPriceIn, GrabPriceOut, ServiceIn, ServiceOut

router = APIRouter(prefix="/services", tags=["services"])


def _service_out(
    service: Service,
    tenant: Tenant,
    channel_price: ServiceChannelPrice | None,
) -> ServiceOut:
    out = ServiceOut.model_validate(service)
    out.grab = GrabPriceOut(**grab_price_for_service(service, tenant, channel_price))
    return out


def _tenant(db: Session, tenant_id: int) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return tenant


@router.get("", response_model=list[ServiceOut])
def list_services(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> list[ServiceOut]:
    tenant = _tenant(db, user.tenant_id)
    services = (
        db.query(Service)
        .filter(Service.tenant_id == user.tenant_id)
        .order_by(Service.id.desc())
        .all()
    )
    prices = channel_price_map(db, user.tenant_id)
    return [_service_out(s, tenant, prices.get(s.id)) for s in services]


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> ServiceOut:
    tenant = _tenant(db, user.tenant_id)
    service = Service(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return _service_out(service, tenant, None)


@router.patch("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> ServiceOut:
    tenant = _tenant(db, user.tenant_id)
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.tenant_id == user.tenant_id)
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    for key, value in payload.model_dump().items():
        setattr(service, key, value)
    db.commit()
    db.refresh(service)
    prices = channel_price_map(db, user.tenant_id)
    return _service_out(service, tenant, prices.get(service.id))


@router.patch("/{service_id}/grab-price", response_model=ServiceOut)
def update_grab_price(
    service_id: int,
    payload: GrabPriceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> ServiceOut:
    tenant = _tenant(db, user.tenant_id)
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.tenant_id == user.tenant_id)
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")

    row = (
        db.query(ServiceChannelPrice)
        .filter(
            ServiceChannelPrice.service_id == service.id,
            ServiceChannelPrice.channel == "grab",
        )
        .first()
    )
    if row is None:
        row = ServiceChannelPrice(
            tenant_id=user.tenant_id,
            service_id=service.id,
            channel="grab",
            external_id=f"svc-{service.id}",
        )
        db.add(row)

    if payload.clear_override:
        row.price_amount = None
    elif payload.price_override is not None:
        row.price_amount = float(Decimal(payload.price_override))
    if payload.markup_percent is not None:
        row.markup_percent = float(Decimal(payload.markup_percent))

    db.commit()
    db.refresh(service)
    db.refresh(row)
    return _service_out(service, tenant, row)
