from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(
    *,
    user_id: int,
    tenant_id: int,
    email: str,
    impersonator_id: int | None = None,
    expire_minutes: int | None = None,
) -> str:
    minutes = expire_minutes if expire_minutes is not None else settings.jwt_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {
        "sub": str(user_id),
        "tenant_id": tenant_id,
        "email": email,
        "exp": expire,
    }
    if impersonator_id is not None:
        payload["impersonator_id"] = impersonator_id
        payload["impersonating"] = True
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    normalized = (email or "").strip().lower()
    user = db.query(User).filter(User.email == normalized, User.is_active.is_(True)).first()
    if user is None:
        # Legacy rows may have mixed-case emails
        user = (
            db.query(User)
            .filter(User.is_active.is_(True))
            .filter(User.email.ilike(normalized))
            .first()
        )
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


def get_user_from_token(db: Session, token: str) -> User | None:
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub", "0"))
    except (JWTError, ValueError, TypeError):
        return None
    return db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()


def get_impersonation_meta(token: str) -> dict:
    try:
        payload = decode_token(token)
    except JWTError:
        return {"impersonating": False, "impersonator_id": None}
    return {
        "impersonating": bool(payload.get("impersonating")),
        "impersonator_id": payload.get("impersonator_id"),
    }
