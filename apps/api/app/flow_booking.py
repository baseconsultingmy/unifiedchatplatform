from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.availability import (
    available_slots,
    date_label,
    dates_with_availability,
    tenant_tz,
)
from app.models import Service, Tenant


def encode_flow_token(*, tenant_id: int, phone: str, conversation_id: int | None = None) -> str:
    payload = {
        "tenant_id": tenant_id,
        "phone": phone,
        "conversation_id": conversation_id,
    }
    return json.dumps(payload, separators=(",", ":"))


def decode_flow_token(flow_token: str) -> dict:
    try:
        data = json.loads(flow_token)
        if isinstance(data, dict) and data.get("tenant_id") and data.get("phone"):
            return data
    except json.JSONDecodeError:
        pass
    return {}


def _package_rows(db: Session, tenant: Tenant) -> list[dict]:
    services = (
        db.query(Service)
        .filter(Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .all()
    )
    rows = []
    for s in services:
        deposit = Decimal(str(s.deposit_amount or 0))
        price = Decimal(str(s.price_amount or 0))
        desc = f"{s.duration_minutes} min · {s.currency} {price:.2f}"
        if deposit > 0:
            desc += f" · deposit {s.currency} {deposit:.2f}"
        rows.append(
            {
                "id": str(s.id),
                "title": (s.name or "Package")[:30],
                "description": desc[:72],
            }
        )
    return rows


def _get_service(db: Session, tenant: Tenant, package_id: str | int | None) -> Service | None:
    if not package_id:
        return None
    try:
        sid = int(package_id)
    except (TypeError, ValueError):
        return None
    return (
        db.query(Service)
        .filter(Service.id == sid, Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .first()
    )


def next_flow_screen(db: Session, tenant: Tenant, decrypted: dict) -> dict:
    """Map a decrypted Flows endpoint request to the next screen payload."""
    version = decrypted.get("version") or "3.0"
    action = decrypted.get("action")
    data = decrypted.get("data") or {}
    screen = decrypted.get("screen")

    if action == "ping":
        return {"version": version, "data": {"status": "active"}}

    if isinstance(data, dict) and data.get("error"):
        return {"version": version, "data": {"acknowledged": True}}

    # Opening the Flow
    if action == "INIT":
        packages = _package_rows(db, tenant)
        if not packages:
            return {
                "version": version,
                "screen": "CONFIRM",
                "data": {
                    "package_id": "",
                    "package_name": "Unavailable",
                    "date_id": "",
                    "date_label": "",
                    "slot_id": "",
                    "slot_label": "",
                    "price_label": "",
                    "summary": "No packages are published yet. Please message the shop.",
                },
            }
        return {
            "version": version,
            "screen": "PACKAGE",
            "data": {"packages": packages},
        }

    # PACKAGE → DATE
    if action == "data_exchange" and (screen == "PACKAGE" or data.get("package_id")) and not data.get("date_id"):
        service = _get_service(db, tenant, data.get("package_id"))
        if service is None:
            return {
                "version": version,
                "screen": "PACKAGE",
                "data": {
                    "packages": _package_rows(db, tenant),
                    "error_message": "Please choose a valid package.",
                },
            }
        tz = tenant_tz(tenant)
        today = datetime.now(tz).date()
        days = dates_with_availability(
            db,
            tenant,
            duration_minutes=int(service.duration_minutes or 60),
            days=14,
        )
        if not days:
            return {
                "version": version,
                "screen": "PACKAGE",
                "data": {
                    "packages": _package_rows(db, tenant),
                    "error_message": "No open dates for that package right now.",
                },
            }
        return {
            "version": version,
            "screen": "DATE",
            "data": {
                "package_id": str(service.id),
                "package_name": service.name,
                "dates": [
                    {
                        "id": d.isoformat(),
                        "title": date_label(d, today),
                        "description": d.strftime("%d %b %Y"),
                    }
                    for d in days
                ],
            },
        }

    # DATE → TIME
    if action == "data_exchange" and data.get("date_id") and not data.get("slot_id"):
        service = _get_service(db, tenant, data.get("package_id"))
        if service is None:
            return next_flow_screen(db, tenant, {**decrypted, "action": "INIT", "data": {}})
        try:
            day = date.fromisoformat(str(data["date_id"]))
        except ValueError:
            return {
                "version": version,
                "screen": "DATE",
                "data": {
                    "package_id": str(service.id),
                    "package_name": service.name,
                    "dates": [],
                    "error_message": "Invalid date selected.",
                },
            }
        slots = available_slots(
            db,
            tenant,
            day=day,
            duration_minutes=int(service.duration_minutes or 60),
        )
        if not slots:
            # Re-offer dates without this sold-out day
            return next_flow_screen(
                db,
                tenant,
                {
                    "version": version,
                    "action": "data_exchange",
                    "screen": "PACKAGE",
                    "data": {"package_id": str(service.id)},
                },
            )
        tz = tenant_tz(tenant)
        today = datetime.now(tz).date()
        return {
            "version": version,
            "screen": "TIME",
            "data": {
                "package_id": str(service.id),
                "package_name": service.name,
                "date_id": day.isoformat(),
                "date_label": date_label(day, today),
                "slots": [
                    {
                        "id": s.isoformat(),
                        "title": s.strftime("%I:%M %p").lstrip("0"),
                    }
                    for s in slots
                ],
            },
        }

    # TIME → CONFIRM
    if action == "data_exchange" and data.get("slot_id"):
        service = _get_service(db, tenant, data.get("package_id"))
        if service is None:
            return next_flow_screen(db, tenant, {**decrypted, "action": "INIT", "data": {}})
        slot_id = str(data["slot_id"])
        try:
            starts = datetime.fromisoformat(slot_id)
        except ValueError:
            return {
                "version": version,
                "data": {"error_message": "That time is invalid. Please try again."},
            }
        tz = tenant_tz(tenant)
        today = datetime.now(tz).date()
        day = starts.astimezone(tz).date()
        # Ensure still available
        open_slots = available_slots(
            db,
            tenant,
            day=day,
            duration_minutes=int(service.duration_minutes or 60),
        )
        if not any(
            abs((s.astimezone(tz) - starts.astimezone(tz)).total_seconds()) < 60 for s in open_slots
        ):
            return next_flow_screen(
                db,
                tenant,
                {
                    "version": version,
                    "action": "data_exchange",
                    "screen": "DATE",
                    "data": {
                        "package_id": str(service.id),
                        "date_id": day.isoformat(),
                    },
                },
            )

        deposit = Decimal(str(service.deposit_amount or 0))
        price = Decimal(str(service.price_amount or 0))
        if deposit > 0:
            price_label = f"Deposit due now: {service.currency} {deposit:.2f}"
        else:
            price_label = f"Total: {service.currency} {price:.2f}"
        slot_label = starts.astimezone(tz).strftime("%I:%M %p").lstrip("0")
        date_lbl = date_label(day, today)
        return {
            "version": version,
            "screen": "CONFIRM",
            "data": {
                "package_id": str(service.id),
                "package_name": service.name,
                "date_id": day.isoformat(),
                "date_label": date_lbl,
                "slot_id": starts.isoformat(),
                "slot_label": slot_label,
                "price_label": price_label,
                "summary": f"{service.name} · {date_lbl} · {slot_label}",
            },
        }

    # Fallback
    return next_flow_screen(db, tenant, {**decrypted, "action": "INIT", "data": {}})
