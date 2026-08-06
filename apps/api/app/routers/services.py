from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.grab_menu import channel_price_map
from app.models import (
    ModifierGroup,
    ModifierOption,
    Service,
    ServiceChannelPrice,
    Tenant,
    User,
)
from app.schemas import (
    GrabPriceIn,
    ModifierGroupIn,
    ModifierGroupOut,
    ModifierOptionOut,
    ServiceIn,
    ServiceOut,
)

router = APIRouter(prefix="/services", tags=["services"])


def _service_out(
    service: Service,
    tenant: Tenant,
    channel_price: ServiceChannelPrice | None,
) -> ServiceOut:
    out = ServiceOut.model_validate(service)
    # Never expose Grab channel pricing / markup to the admin UI or API clients.
    # Pricing is applied only when publishing menus to Grab.
    out.grab = None
    groups = [
        g
        for g in (service.modifier_groups or [])
        if g.is_active
    ]
    out.modifiers = [
        ModifierGroupOut(
            id=g.id,
            service_id=g.service_id,
            name=g.name,
            min_select=g.min_select,
            max_select=g.max_select,
            required=g.required,
            sort_order=g.sort_order,
            is_active=g.is_active,
            options=[
                ModifierOptionOut.model_validate(o)
                for o in sorted((g.options or []), key=lambda x: x.sort_order)
                if o.is_active
            ],
        )
        for g in sorted(groups, key=lambda x: x.sort_order)
    ]
    return out


def _tenant(db: Session, tenant_id: int) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return tenant


def _get_service(db: Session, tenant_id: int, service_id: int) -> Service:
    service = (
        db.query(Service)
        .options(
            joinedload(Service.modifier_groups).joinedload(ModifierGroup.options),
        )
        .filter(Service.id == service_id, Service.tenant_id == tenant_id)
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.get("", response_model=list[ServiceOut])
def list_services(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> list[ServiceOut]:
    tenant = _tenant(db, user.tenant_id)
    services = (
        db.query(Service)
        .options(
            joinedload(Service.modifier_groups).joinedload(ModifierGroup.options),
        )
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
    return _service_out(_get_service(db, user.tenant_id, service.id), tenant, None)


@router.patch("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> ServiceOut:
    tenant = _tenant(db, user.tenant_id)
    service = _get_service(db, user.tenant_id, service_id)
    for key, value in payload.model_dump().items():
        setattr(service, key, value)
    db.commit()
    prices = channel_price_map(db, user.tenant_id)
    return _service_out(_get_service(db, user.tenant_id, service_id), tenant, prices.get(service_id))


@router.patch("/{service_id}/grab-price", response_model=ServiceOut)
def update_grab_price(
    service_id: int,
    payload: GrabPriceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> ServiceOut:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Grab channel pricing is managed by BaseApp support only",
    )


@router.put("/{service_id}/modifiers", response_model=list[ModifierGroupOut])
def replace_modifiers(
    service_id: int,
    payload: list[ModifierGroupIn],
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> list[ModifierGroupOut]:
    """Replace all customization groups for a menu item."""
    service = _get_service(db, user.tenant_id, service_id)
    for group in list(service.modifier_groups or []):
        db.delete(group)
    db.flush()

    for idx, g in enumerate(payload):
        if g.max_select < max(1, g.min_select):
            raise HTTPException(status_code=400, detail=f"Invalid select range for {g.name}")
        group = ModifierGroup(
            tenant_id=user.tenant_id,
            service_id=service.id,
            name=g.name.strip(),
            min_select=g.min_select,
            max_select=g.max_select,
            required=g.required or g.min_select > 0,
            sort_order=g.sort_order if g.sort_order else idx,
            is_active=g.is_active,
        )
        db.add(group)
        db.flush()
        for oidx, opt in enumerate(g.options):
            db.add(
                ModifierOption(
                    group_id=group.id,
                    name=opt.name.strip(),
                    price_delta=float(opt.price_delta or 0),
                    sort_order=opt.sort_order if opt.sort_order else oidx,
                    is_active=opt.is_active,
                )
            )
    db.commit()
    service = _get_service(db, user.tenant_id, service_id)
    tenant = _tenant(db, user.tenant_id)
    return _service_out(service, tenant, None).modifiers
