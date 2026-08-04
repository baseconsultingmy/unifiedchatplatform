"""Channel pricing helpers — walk-in base vs Grab (and future channels)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.models import Service, ServiceChannelPrice, Tenant


def _money(value: Decimal | float | int | str | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def round_channel_price(amount: Decimal) -> Decimal:
    """Round marketplace prices to .00 or .50 for cleaner Grab listings."""
    cents = (amount * 100).to_integral_value(rounding=ROUND_HALF_UP)
    # Snap to nearest 50 sen when not already on .00/.50
    mod = int(cents) % 50
    if mod == 0:
        return (cents / 100).quantize(Decimal("0.01"))
    if mod < 25:
        cents = cents - mod
    else:
        cents = cents + (50 - mod)
    return (Decimal(cents) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def effective_markup_percent(
    tenant: Tenant,
    channel_price: ServiceChannelPrice | None,
) -> Decimal:
    if channel_price and channel_price.markup_percent is not None:
        return Decimal(str(channel_price.markup_percent))
    return Decimal(str(tenant.grab_markup_percent or 30))


def compute_channel_price(
    *,
    base_price: Decimal | float | int,
    tenant: Tenant,
    channel_price: ServiceChannelPrice | None = None,
    channel: str = "grab",
) -> Decimal:
    """
    Walk-in/dine-in uses Service.price_amount.
    Grab uses override price when set, else base × (1 + markup%).
    """
    base = _money(base_price)
    if channel != "grab":
        return base
    if channel_price and channel_price.price_amount is not None:
        return _money(channel_price.price_amount)
    markup = effective_markup_percent(tenant, channel_price)
    marked = base * (Decimal("1") + markup / Decimal("100"))
    return round_channel_price(marked)


def grab_price_for_service(
    service: Service,
    tenant: Tenant,
    channel_price: ServiceChannelPrice | None = None,
) -> dict:
    base = _money(service.price_amount)
    markup = effective_markup_percent(tenant, channel_price)
    grab = compute_channel_price(
        base_price=base,
        tenant=tenant,
        channel_price=channel_price,
        channel="grab",
    )
    mode = "override" if channel_price and channel_price.price_amount is not None else "markup"
    return {
        "channel": "grab",
        "base_price": float(base),
        "grab_price": float(grab),
        "markup_percent": float(markup),
        "pricing_mode": mode,
        "price_override": float(channel_price.price_amount)
        if channel_price and channel_price.price_amount is not None
        else None,
        "external_id": channel_price.external_id if channel_price else None,
        "is_published": bool(channel_price.is_published) if channel_price else False,
    }
