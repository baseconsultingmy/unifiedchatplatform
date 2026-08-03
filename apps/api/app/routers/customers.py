from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Customer, User
from app.schemas import CustomerIn, CustomerOut

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerOut])
def list_customers(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[Customer]:
    return (
        db.query(Customer)
        .filter(Customer.tenant_id == user.tenant_id)
        .order_by(Customer.id.desc())
        .all()
    )


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Customer:
    existing = (
        db.query(Customer)
        .filter(Customer.tenant_id == user.tenant_id, Customer.phone == payload.phone)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this phone already exists")
    customer = Customer(tenant_id=user.tenant_id, **payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer
