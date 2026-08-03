from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Resource, User
from app.schemas import ResourceIn, ResourceOut

router = APIRouter(prefix="/resources", tags=["resources"])


@router.get("", response_model=list[ResourceOut])
def list_resources(
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
    kind: str | None = Query(default=None),
    active_only: bool = Query(default=False),
) -> list[Resource]:
    q = db.query(Resource).filter(Resource.tenant_id == user.tenant_id)
    if kind:
        q = q.filter(Resource.kind == kind)
    if active_only:
        q = q.filter(Resource.is_active.is_(True))
    return q.order_by(Resource.kind.asc(), Resource.sort_order.asc(), Resource.id.asc()).all()


@router.post("", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
def create_resource(
    payload: ResourceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Resource:
    resource = Resource(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.patch("/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: int,
    payload: ResourceIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Resource:
    resource = (
        db.query(Resource)
        .filter(Resource.id == resource_id, Resource.tenant_id == user.tenant_id)
        .first()
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    for key, value in payload.model_dump().items():
        setattr(resource, key, value)
    db.commit()
    db.refresh(resource)
    return resource
