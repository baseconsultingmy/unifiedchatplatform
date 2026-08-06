"""Sales reports for vendor owners (daily / monthly / range)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.availability import tenant_tz
from app.currency import tenant_currency
from app.db import get_db
from app.deps import require_vendor_user
from app.models import (
    Booking,
    BookingStatus,
    Order,
    OrderStatus,
    PaymentStatus,
    Tenant,
    User,
)
from app.schemas import (
    SalesChannelRow,
    SalesPeriodRow,
    SalesReportOut,
    SalesTopItemRow,
)

router = APIRouter(prefix="/reports", tags=["reports"])

PAID_PAYMENT = {PaymentStatus.paid, PaymentStatus.deposit_paid}
SKIP_BOOKING_STATUS = {BookingStatus.cancelled, BookingStatus.no_show}
COMPLETED_ORDER = {OrderStatus.completed.value, "completed"}


def _d(value: Any) -> Decimal:
    return Decimal(str(value or 0))


def _money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _booking_collected(booking: Booking) -> Decimal:
    if booking.payment_status == PaymentStatus.paid:
        return _d(booking.amount)
    if booking.payment_status == PaymentStatus.deposit_paid:
        deposit = _d(booking.deposit_amount)
        return deposit if deposit > 0 else _d(booking.amount)
    return Decimal("0")


def _booking_gross(booking: Booking) -> Decimal:
    return _d(booking.amount)


def _parse_day(value: str | None, label: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label} (use YYYY-MM-DD)") from exc


def _range_bounds(
    tenant: Tenant,
    *,
    period: str,
    day_from: date | None,
    day_to: date | None,
) -> tuple[datetime, datetime, date, date, str]:
    """Return (start_utc, end_utc_exclusive, local_from, local_to, grain)."""
    tz = tenant_tz(tenant)
    now_local = datetime.now(tz)
    today = now_local.date()
    grain = "day"

    if period == "today":
        local_from = today
        local_to = today
    elif period == "yesterday":
        local_from = today - timedelta(days=1)
        local_to = local_from
    elif period == "7d":
        local_from = today - timedelta(days=6)
        local_to = today
    elif period == "30d":
        local_from = today - timedelta(days=29)
        local_to = today
    elif period == "month":
        local_from = today.replace(day=1)
        local_to = today
        grain = "day"
    elif period == "last_month":
        first_this = today.replace(day=1)
        local_to = first_this - timedelta(days=1)
        local_from = local_to.replace(day=1)
        grain = "day"
    elif period == "year":
        local_from = today.replace(month=1, day=1)
        local_to = today
        grain = "month"
    elif period == "custom":
        if not day_from or not day_to:
            raise HTTPException(status_code=400, detail="from and to are required for custom period")
        if day_to < day_from:
            raise HTTPException(status_code=400, detail="to must be on or after from")
        if (day_to - day_from).days > 366:
            raise HTTPException(status_code=400, detail="Range cannot exceed 366 days")
        local_from = day_from
        local_to = day_to
        grain = "month" if (day_to - day_from).days > 45 else "day"
    else:
        raise HTTPException(status_code=400, detail="Unknown period")

    start_local = datetime(local_from.year, local_from.month, local_from.day, tzinfo=tz)
    end_local = datetime(local_to.year, local_to.month, local_to.day, tzinfo=tz) + timedelta(days=1)
    return (
        start_local.astimezone(timezone.utc),
        end_local.astimezone(timezone.utc),
        local_from,
        local_to,
        grain,
    )


def _bucket_key(dt: datetime, tz, grain: str) -> str:
    local = dt.astimezone(tz)
    if grain == "month":
        return local.strftime("%Y-%m")
    return local.date().isoformat()


def _bucket_label(key: str, grain: str) -> str:
    if grain == "month":
        y, m = key.split("-")
        return datetime(int(y), int(m), 1).strftime("%b %Y")
    d = date.fromisoformat(key)
    return d.strftime("%a %d %b")


def _prev_range(local_from: date, local_to: date) -> tuple[date, date]:
    span = (local_to - local_from).days + 1
    prev_to = local_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=span - 1)
    return prev_from, prev_to


def _channel_label(raw: str | None) -> str:
    key = (raw or "manual").lower()
    return {
        "whatsapp": "WhatsApp",
        "line": "LINE",
        "web": "Web",
        "manual": "POS / Walk-in",
        "grab": "Grab",
        "foodpanda": "foodpanda",
    }.get(key, key.replace("_", " ").title())


@router.get("/sales", response_model=SalesReportOut)
def sales_report(
    period: str = Query(
        default="today",
        description="today|yesterday|7d|30d|month|last_month|year|custom",
    ),
    day_from: str | None = Query(default=None, alias="from"),
    day_to: str | None = Query(default=None, alias="to"),
    grain: str | None = Query(default=None, description="day|month (optional override)"),
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> SalesReportOut:
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")

    start_utc, end_utc, local_from, local_to, auto_grain = _range_bounds(
        tenant,
        period=period,
        day_from=_parse_day(day_from, "from"),
        day_to=_parse_day(day_to, "to"),
    )
    if grain in ("day", "month"):
        auto_grain = grain
    tz = tenant_tz(tenant)

    bookings = (
        db.query(Booking)
        .options(joinedload(Booking.service))
        .filter(
            Booking.tenant_id == tenant.id,
            Booking.payment_status.in_(list(PAID_PAYMENT)),
            Booking.status.notin_(list(SKIP_BOOKING_STATUS)),
            Booking.paid_at.isnot(None),
            Booking.paid_at >= start_utc,
            Booking.paid_at < end_utc,
        )
        .all()
    )

    orders = (
        db.query(Order)
        .options(joinedload(Order.lines))
        .filter(
            Order.tenant_id == tenant.id,
            Order.status.in_(list(COMPLETED_ORDER)),
            Order.completed_at.isnot(None),
            Order.completed_at >= start_utc,
            Order.completed_at < end_utc,
        )
        .all()
    )

    collected = Decimal("0")
    gross = Decimal("0")
    by_period: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"collected": Decimal("0"), "gross": Decimal("0"), "count": 0}
    )
    by_channel: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"collected": Decimal("0"), "gross": Decimal("0"), "count": 0}
    )
    top_map: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"revenue": Decimal("0"), "qty": 0}
    )
    currency = tenant_currency(tenant) if tenant else "MYR"

    for b in bookings:
        c = _booking_collected(b)
        g = _booking_gross(b)
        collected += c
        gross += g
        currency = b.currency or currency
        when = b.paid_at or b.created_at
        if when is None:
            continue
        key = _bucket_key(when, tz, auto_grain)
        by_period[key]["collected"] = Decimal(str(by_period[key]["collected"])) + c
        by_period[key]["gross"] = Decimal(str(by_period[key]["gross"])) + g
        by_period[key]["count"] = int(by_period[key]["count"]) + 1

        ch = b.channel.value if hasattr(b.channel, "value") else str(b.channel or "manual")
        by_channel[ch]["collected"] = Decimal(str(by_channel[ch]["collected"])) + c
        by_channel[ch]["gross"] = Decimal(str(by_channel[ch]["gross"])) + g
        by_channel[ch]["count"] = int(by_channel[ch]["count"]) + 1

        name = b.service.name if b.service else "Booking"
        top_map[name]["revenue"] = Decimal(str(top_map[name]["revenue"])) + c
        top_map[name]["qty"] = int(top_map[name]["qty"]) + 1

    for o in orders:
        c = _d(o.total_amount)
        collected += c
        gross += c
        currency = o.currency or currency
        when = o.completed_at or o.created_at
        if when is None:
            continue
        key = _bucket_key(when, tz, auto_grain)
        by_period[key]["collected"] = Decimal(str(by_period[key]["collected"])) + c
        by_period[key]["gross"] = Decimal(str(by_period[key]["gross"])) + c
        by_period[key]["count"] = int(by_period[key]["count"]) + 1

        ch = (o.channel or "grab").lower()
        by_channel[ch]["collected"] = Decimal(str(by_channel[ch]["collected"])) + c
        by_channel[ch]["gross"] = Decimal(str(by_channel[ch]["gross"])) + c
        by_channel[ch]["count"] = int(by_channel[ch]["count"]) + 1

        for line in o.lines or []:
            name = line.name or "Item"
            qty = int(line.quantity or 1)
            top_map[name]["revenue"] = Decimal(str(top_map[name]["revenue"])) + _d(line.line_total)
            top_map[name]["qty"] = int(top_map[name]["qty"]) + qty

    # Outstanding (open money) as of now — not limited to period
    outstanding_bookings = (
        db.query(Booking)
        .filter(
            Booking.tenant_id == tenant.id,
            Booking.status.notin_(list(SKIP_BOOKING_STATUS)),
            Booking.payment_status.in_(
                [PaymentStatus.unpaid, PaymentStatus.deposit_due, PaymentStatus.deposit_paid]
            ),
        )
        .all()
    )
    outstanding = Decimal("0")
    outstanding_count = 0
    for b in outstanding_bookings:
        if b.payment_status == PaymentStatus.deposit_paid:
            rem = _d(b.amount) - _d(b.deposit_amount)
            if rem > 0:
                outstanding += rem
                outstanding_count += 1
        else:
            due = _d(b.deposit_amount) if _d(b.deposit_amount) > 0 else _d(b.amount)
            if due > 0:
                outstanding += due
                outstanding_count += 1

    # Previous period comparison (same length, immediately before)
    prev_from, prev_to = _prev_range(local_from, local_to)
    prev_start_local = datetime(prev_from.year, prev_from.month, prev_from.day, tzinfo=tz)
    prev_end_local = datetime(prev_to.year, prev_to.month, prev_to.day, tzinfo=tz) + timedelta(
        days=1
    )
    prev_start = prev_start_local.astimezone(timezone.utc)
    prev_end = prev_end_local.astimezone(timezone.utc)

    prev_bookings = (
        db.query(Booking)
        .filter(
            Booking.tenant_id == tenant.id,
            Booking.payment_status.in_(list(PAID_PAYMENT)),
            Booking.status.notin_(list(SKIP_BOOKING_STATUS)),
            Booking.paid_at.isnot(None),
            Booking.paid_at >= prev_start,
            Booking.paid_at < prev_end,
        )
        .all()
    )
    prev_orders = (
        db.query(Order)
        .filter(
            Order.tenant_id == tenant.id,
            Order.status.in_(list(COMPLETED_ORDER)),
            Order.completed_at.isnot(None),
            Order.completed_at >= prev_start,
            Order.completed_at < prev_end,
        )
        .all()
    )
    prev_collected = sum((_booking_collected(b) for b in prev_bookings), Decimal("0")) + sum(
        (_d(o.total_amount) for o in prev_orders), Decimal("0")
    )
    prev_tx = len(prev_bookings) + len(prev_orders)

    tx_count = len(bookings) + len(orders)
    avg_ticket = (collected / tx_count) if tx_count else Decimal("0")
    delta_pct = None
    if prev_collected > 0:
        delta_pct = float(((collected - prev_collected) / prev_collected * 100).quantize(Decimal("0.1")))
    elif collected > 0:
        delta_pct = 100.0

    # Fill empty buckets so charts have a continuous axis
    series_keys: list[str] = []
    if auto_grain == "month":
        cursor = date(local_from.year, local_from.month, 1)
        end_m = date(local_to.year, local_to.month, 1)
        while cursor <= end_m:
            series_keys.append(cursor.strftime("%Y-%m"))
            if cursor.month == 12:
                cursor = date(cursor.year + 1, 1, 1)
            else:
                cursor = date(cursor.year, cursor.month + 1, 1)
    else:
        cursor = local_from
        while cursor <= local_to:
            series_keys.append(cursor.isoformat())
            cursor += timedelta(days=1)

    series = [
        SalesPeriodRow(
            key=k,
            label=_bucket_label(k, auto_grain),
            collected=_money(Decimal(str(by_period[k]["collected"]))),
            gross=_money(Decimal(str(by_period[k]["gross"]))),
            transactions=int(by_period[k]["count"]),
        )
        for k in series_keys
    ]

    channels = [
        SalesChannelRow(
            channel=ch,
            label=_channel_label(ch),
            collected=_money(Decimal(str(vals["collected"]))),
            gross=_money(Decimal(str(vals["gross"]))),
            transactions=int(vals["count"]),
        )
        for ch, vals in sorted(
            by_channel.items(), key=lambda kv: Decimal(str(kv[1]["collected"])), reverse=True
        )
    ]

    top_items = [
        SalesTopItemRow(
            name=name,
            quantity=int(vals["qty"]),
            revenue=_money(Decimal(str(vals["revenue"]))),
        )
        for name, vals in sorted(
            top_map.items(), key=lambda kv: Decimal(str(kv[1]["revenue"])), reverse=True
        )[:10]
    ]

    return SalesReportOut(
        period=period,
        grain=auto_grain,
        timezone=str(tz),
        currency=currency,
        from_date=local_from.isoformat(),
        to_date=local_to.isoformat(),
        collected=_money(collected),
        gross=_money(gross),
        transactions=tx_count,
        average_ticket=_money(avg_ticket),
        outstanding=_money(outstanding),
        outstanding_count=outstanding_count,
        previous_collected=_money(prev_collected),
        previous_transactions=prev_tx,
        previous_from=prev_from.isoformat(),
        previous_to=prev_to.isoformat(),
        collected_delta_pct=delta_pct,
        series=series,
        channels=channels,
        top_items=top_items,
        booking_sales=len(bookings),
        order_sales=len(orders),
    )
