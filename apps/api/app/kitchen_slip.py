"""Build kitchen printer slip text from an open POS ticket."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models import PosTicket


def format_kitchen_slip(ticket: PosTicket, *, shop_name: str = "Kitchen") -> str:
    now = datetime.now(timezone.utc).astimezone().strftime("%d/%m %H:%M")
    lines = [
        shop_name.upper(),
        f"TABLE: {ticket.table_label}",
        f"#{ticket.id}  {now}",
        "-" * 28,
    ]
    for line in ticket.lines or []:
        lines.append(f"{line.quantity}x {line.name}")
        for mod in line.mods or []:
            delta = float(mod.price_delta or 0)
            suffix = f" (+{delta:.2f})" if delta else ""
            lines.append(f"   - {mod.name}{suffix}")
        if line.remarks:
            lines.append(f"   * {line.remarks}")
    if ticket.notes:
        lines.append("-" * 28)
        lines.append(f"NOTE: {ticket.notes}")
    lines.append("-" * 28)
    lines.append(f"TOTAL  {ticket.currency} {float(ticket.total_amount):.2f}")
    lines.append("")
    return "\n".join(lines)
