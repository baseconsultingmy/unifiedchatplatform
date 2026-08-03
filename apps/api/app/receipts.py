from __future__ import annotations

from decimal import Decimal
from urllib.parse import quote
from zoneinfo import ZoneInfo

from app.models import Booking
from app.payments import amount_due


def normalize_phone(raw: str | None, *, default_country: str = "60") -> str | None:
    if not raw:
        return None
    phone = raw.strip()
    if phone.lower().startswith("walkin-"):
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 8:
        return None
    # Local MY numbers like 0123456789 → 60123456789
    if digits.startswith("0") and len(digits) >= 9:
        digits = default_country + digits[1:]
    return digits


def wa_click_to_chat(phone: str, body: str) -> str:
    return f"https://wa.me/{phone}?text={quote(body)}"


def line_items_from_booking(booking: Booking) -> list[str]:
    notes = booking.notes or ""
    if "POS · " in notes:
        cart = notes.split("POS · ", 1)[1].strip()
        cart = cart.split(" · Cash ")[0].strip()
        if cart:
            return [part.strip() for part in cart.split(",") if part.strip()]
    if booking.service:
        return [booking.service.name]
    return ["Booking"]


def format_receipt_text(
    *,
    booking: Booking,
    line_items: list[str] | None = None,
    cash_received: Decimal | None = None,
    change: Decimal | None = None,
    payment_label: str | None = None,
) -> str:
    """Shared WhatsApp / print receipt body for POS and inbound bookings."""
    shop = booking.tenant.name if booking.tenant else "BaseApp"
    customer = booking.customer.name if booking.customer else "Guest"
    phone = booking.customer.phone if booking.customer else ""
    currency = booking.currency or "MYR"
    due = amount_due(booking)
    when = "now"
    if booking.starts_at:
        tz_name = booking.tenant.timezone if booking.tenant else "Asia/Kuala_Lumpur"
        try:
            tz = ZoneInfo(tz_name or "Asia/Kuala_Lumpur")
        except Exception:
            tz = ZoneInfo("Asia/Kuala_Lumpur")
        when = booking.starts_at.astimezone(tz).strftime("%d %b %Y %H:%M")
    items = line_items if line_items is not None else line_items_from_booking(booking)

    if payment_label:
        pay = payment_label
    else:
        raw = (
            booking.payment_status.value
            if hasattr(booking.payment_status, "value")
            else str(booking.payment_status)
        )
        pay = raw.replace("_", " ")

    lines = [
        f"*{shop} — receipt*",
        f"Booking #{booking.id}",
        f"When: {when}",
        f"Customer: {customer}",
    ]
    if phone and not str(phone).lower().startswith("walkin-"):
        lines.append(f"Phone: {phone}")
    lines.append("")
    lines.append("Items:")
    for item in items:
        lines.append(f"• {item}")
    lines.append("")
    lines.append(f"Total: {currency} {Decimal(str(due)):.2f}")
    lines.append(f"Status: {pay}")
    if cash_received is not None:
        lines.append(f"Cash received: {currency} {Decimal(str(cash_received)):.2f}")
        lines.append(f"Change: {currency} {Decimal(str(change or 0)):.2f}")
    lines.append("")
    lines.append("Thank you!")
    return "\n".join(lines)
