from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import AccountUpdateIn, LoginIn, TokenOut, UserOut
from app.security import (
    authenticate_user,
    create_access_token,
    get_impersonation_meta,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(request: Request, user: User, db: Session) -> UserOut:
    auth = request.headers.get("Authorization") or ""
    token = auth.removeprefix("Bearer ").strip()
    meta = get_impersonation_meta(token) if token else {"impersonating": False, "impersonator_id": None}

    impersonator_email = None
    impersonator_id = meta.get("impersonator_id")
    if impersonator_id:
        impersonator = db.query(User).filter(User.id == int(impersonator_id)).first()
        impersonator_email = impersonator.email if impersonator else None

    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant=user.tenant,
        impersonating=bool(meta.get("impersonating")),
        impersonator_id=int(impersonator_id) if impersonator_id else None,
        impersonator_email=impersonator_email,
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user_id=user.id, tenant_id=user.tenant_id, email=user.email)
    return TokenOut(access_token=token)


@router.get("/me", response_model=UserOut)
def me(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    return _user_out(request, user, db)


@router.patch("/me", response_model=UserOut)
def update_account(
    payload: AccountUpdateIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Allow any signed-in user to update their login email / password / name."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if payload.full_name is not None:
        name = payload.full_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        user.full_name = name

    if payload.email is not None:
        email = str(payload.email).strip().lower()
        if email != user.email.lower():
            taken = db.query(User).filter(User.email == email, User.id != user.id).first()
            if taken is not None:
                raise HTTPException(status_code=400, detail="That email is already in use")
            user.email = email

    if payload.new_password is not None:
        user.password_hash = hash_password(payload.new_password)

    db.commit()
    db.refresh(user)
    return _user_out(request, user, db)
