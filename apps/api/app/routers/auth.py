from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.google_auth import google_enabled, verify_google_id_token
from app.models import User
from app.schemas import (
    AccountUpdateIn,
    GoogleAuthIn,
    LoginIn,
    SocialStatusOut,
    TokenOut,
    UserOut,
)
from app.security import (
    authenticate_user,
    create_access_token,
    get_impersonation_meta,
    hash_password,
    verify_password,
)
from app.vendor_provision import provision_vendor

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
        auth_provider=getattr(user, "auth_provider", None) or "password",
        has_password=bool(user.password_hash),
        tenant=user.tenant,
        impersonating=bool(meta.get("impersonating")),
        impersonator_id=int(impersonator_id) if impersonator_id else None,
        impersonator_email=impersonator_email,
    )


def _issue_token(user: User) -> TokenOut:
    token = create_access_token(user_id=user.id, tenant_id=user.tenant_id, email=user.email)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return _issue_token(user)


@router.get("/social", response_model=SocialStatusOut)
def social_status() -> SocialStatusOut:
    enabled = google_enabled()
    return SocialStatusOut(
        google_enabled=enabled,
        google_client_id=settings.google_client_id.strip() if enabled else None,
    )


@router.post("/google", response_model=TokenOut)
def google_auth(payload: GoogleAuthIn, db: Session = Depends(get_db)) -> TokenOut:
    """Sign in or create a merchant shop with a Google ID token (GIS)."""
    identity = verify_google_id_token(payload.credential)

    user = db.query(User).filter(User.google_sub == identity.sub, User.is_active.is_(True)).first()
    if user is None:
        user = db.query(User).filter(User.email == identity.email, User.is_active.is_(True)).first()
        if user is not None:
            # Link Google to an existing password account with the same verified email.
            if user.google_sub and user.google_sub != identity.sub:
                raise HTTPException(status_code=400, detail="Email is linked to another Google account")
            user.google_sub = identity.sub
            if user.auth_provider == "password":
                user.auth_provider = "password+google"
            db.commit()
            db.refresh(user)

    if user is not None:
        return _issue_token(user)

    if payload.mode != "signup":
        raise HTTPException(
            status_code=404,
            detail="No BaseApp account for this Google login. Create a shop first.",
        )

    shop = (payload.shop_name or "").strip()
    if not shop:
        raise HTTPException(status_code=400, detail="Shop name is required to create an account")

    try:
        _tenant, user = provision_vendor(
            db,
            name=shop,
            industry=payload.industry,
            owner_email=identity.email,
            owner_full_name=identity.name,
            owner_password=None,
            auth_provider="google",
            google_sub=identity.sub,
            timezone=payload.timezone,
            country=payload.country,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    db.refresh(user)
    return _issue_token(user)


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
    has_password = bool(user.password_hash)
    current = (payload.current_password or "").strip()

    if has_password:
        if not current or not verify_password(current, user.password_hash or ""):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    elif payload.new_password is None and payload.email is not None:
        # Google-only users may change name freely; email/password need Google or a new password.
        if str(payload.email).strip().lower() != user.email.lower():
            raise HTTPException(
                status_code=400,
                detail="Set a password first before changing login email",
            )
    elif payload.new_password is not None and not has_password:
        # First password for a social-only account — no current password required.
        pass
    elif not has_password and payload.full_name is None and payload.new_password is None:
        raise HTTPException(status_code=400, detail="Nothing to update")

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
        if user.auth_provider == "google":
            user.auth_provider = "password+google"

    db.commit()
    db.refresh(user)
    return _user_out(request, user, db)
