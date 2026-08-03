from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Service, User
from app.schemas import ServiceIn, ServiceOut

router = APIRouter(prefix="/services", tags=["services"])


@router.get("", response_model=list[ServiceOut])
def list_services(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Service]:
    return (
        db.query(Service)
        .filter(Service.tenant_id == user.tenant_id)
        .order_by(Service.id.desc())
        .all()
    )


@router.post("", response_model=ServiceOut, status_code=status.HTTP_201_CREATED)
def create_service(
    payload: ServiceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Service:
    service = Service(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Service:
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
    return service
