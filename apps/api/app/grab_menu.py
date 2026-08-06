"""Build Grab Food menu payloads from BaseApp catalog + channel prices."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.models import ModifierGroup, Service, ServiceChannelPrice, Tenant
from app.pricing import compute_channel_price


SELLING_TIME_ID = "all-day"


def _minor(amount: Decimal | float | int) -> int:
    return int((Decimal(str(amount)) * 100).to_integral_value())


def channel_price_map(db: Session, tenant_id: int) -> dict[int, ServiceChannelPrice]:
    rows = (
        db.query(ServiceChannelPrice)
        .filter(
            ServiceChannelPrice.tenant_id == tenant_id,
            ServiceChannelPrice.channel == "grab",
        )
        .all()
    )
    return {row.service_id: row for row in rows}


def build_grab_menu(db: Session, tenant: Tenant) -> dict:
    """Grab Get Menu response shape (simplified, production-compatible fields)."""
    services = (
        db.query(Service)
        .options(
            joinedload(Service.modifier_groups).joinedload(ModifierGroup.options),
        )
        .filter(Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .order_by(Service.category.asc(), Service.name.asc())
        .all()
    )
    prices = channel_price_map(db, tenant.id)
    by_category: dict[str, list[Service]] = defaultdict(list)
    for service in services:
        by_category[service.category or "Menu"].append(service)

    categories = []
    for seq, (cat_name, items) in enumerate(by_category.items(), start=1):
        menu_items = []
        for service in items:
            cp = prices.get(service.id)
            grab_price = compute_channel_price(
                base_price=service.price_amount,
                tenant=tenant,
                channel_price=cp,
                channel="grab",
            )
            external_id = (cp.external_id if cp and cp.external_id else None) or f"svc-{service.id}"
            if cp is None:
                cp = ServiceChannelPrice(
                    tenant_id=tenant.id,
                    service_id=service.id,
                    channel="grab",
                    external_id=external_id,
                )
                db.add(cp)
            elif not cp.external_id:
                cp.external_id = external_id
            modifier_groups = []
            for g in service.modifier_groups or []:
                if not g.is_active:
                    continue
                options = []
                for opt in g.options or []:
                    if not opt.is_active:
                        continue
                    options.append(
                        {
                            "id": f"mod-{opt.id}",
                            "name": opt.name,
                            "price": _minor(opt.price_delta or 0),
                            "availableStatus": "AVAILABLE",
                            "sequence": opt.sort_order or 0,
                        }
                    )
                if not options:
                    continue
                modifier_groups.append(
                    {
                        "id": f"modg-{g.id}",
                        "name": g.name,
                        "availableStatus": "AVAILABLE",
                        "selectionRangeMin": int(g.min_select or (1 if g.required else 0)),
                        "selectionRangeMax": int(g.max_select or 1),
                        "sequence": g.sort_order or 0,
                        "modifiers": options,
                    }
                )
            menu_items.append(
                {
                    "id": external_id,
                    "name": service.name,
                    "availableStatus": "AVAILABLE",
                    "description": (service.description or "")[:2000],
                    "price": _minor(grab_price),
                    "photos": [],
                    "modifierGroups": modifier_groups,
                }
            )
        categories.append(
            {
                "id": f"cat-{seq}-{cat_name.lower().replace(' ', '-')}",
                "name": cat_name,
                "availableStatus": "AVAILABLE",
                "sellingTimeID": SELLING_TIME_ID,
                "sequence": seq,
                "items": menu_items,
            }
        )

    db.flush()
    return {
        "merchantID": tenant.grab_merchant_id or tenant.slug,
        "partnerMerchantID": tenant.slug,
        "currency": {
            "code": "MYR",
            "symbol": "RM",
            "exponent": 2,
        },
        "sellingTimes": [
            {
                "id": SELLING_TIME_ID,
                "name": "All day",
                "sequence": 1,
                "serviceHours": {
                    "mon": {"openPeriodType": "OpenAllDay", "periods": []},
                    "tue": {"openPeriodType": "OpenAllDay", "periods": []},
                    "wed": {"openPeriodType": "OpenAllDay", "periods": []},
                    "thu": {"openPeriodType": "OpenAllDay", "periods": []},
                    "fri": {"openPeriodType": "OpenAllDay", "periods": []},
                    "sat": {"openPeriodType": "OpenAllDay", "periods": []},
                    "sun": {"openPeriodType": "OpenAllDay", "periods": []},
                },
                "startTime": "2024-01-01 00:00:00",
                "endTime": "2099-12-31 23:59:59",
            }
        ],
        "categories": categories,
    }
