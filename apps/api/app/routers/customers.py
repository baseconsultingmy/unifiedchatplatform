from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_vendor_user
from app.models import Customer, User
from app.schemas import CustomerIn, CustomerOut, CustomerUpdateIn

router = APIRouter(prefix="/customers", tags=["customers"])


def _normalize_phone(raw: str) -> str:
    phone = "".join(ch for ch in (raw or "").strip() if ch.isdigit() or ch == "+")
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("0") and len(digits) >= 9:
        digits = "60" + digits[1:]
    return digits or (raw or "").strip()


@router.get("", response_model=list[CustomerOut])
def list_customers(
    user: User = Depends(require_vendor_user), db: Session = Depends(get_db)
) -> list[Customer]:
    return (
        db.query(Customer)
        .filter(Customer.tenant_id == user.tenant_id)
        .order_by(Customer.id.desc())
        .all()
    )


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Customer:
    customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.tenant_id == user.tenant_id)
        .first()
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Customer:
    phone = _normalize_phone(payload.phone)
    existing = (
        db.query(Customer)
        .filter(Customer.tenant_id == user.tenant_id, Customer.phone == phone)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this phone already exists")
    data = payload.model_dump()
    data["phone"] = phone
    if data.get("email") == "":
        data["email"] = None
    customer = Customer(tenant_id=user.tenant_id, **data)
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdateIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> Customer:
    customer = (
        db.query(Customer)
        .filter(Customer.id == customer_id, Customer.tenant_id == user.tenant_id)
        .first()
    )
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    data = payload.model_dump(exclude_unset=True)
    if "phone" in data and data["phone"] is not None:
        phone = _normalize_phone(data["phone"])
        clash = (
            db.query(Customer)
            .filter(
                Customer.tenant_id == user.tenant_id,
                Customer.phone == phone,
                Customer.id != customer.id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Another customer already uses this phone")
        data["phone"] = phone
    if data.get("email") == "":
        data["email"] = None

    for key, value in data.items():
        setattr(customer, key, value)

    db.commit()
    db.refresh(customer)
    return customer
