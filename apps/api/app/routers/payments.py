from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Booking
from app.payments import mark_booking_paid
from app.whatsapp_receipt import deliver_booking_receipt

router = APIRouter(tags=["payments"])


def _page(title: str, body: str) -> HTMLResponse:
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · BaseApp</title>
  <style>
    :root {{
      --ink: #1a1f1c;
      --muted: #5c675f;
      --line: #d7ddd8;
      --bg: #f3f6f2;
      --card: #ffffff;
      --accent: #0f6b4c;
      --accent-ink: #ffffff;
      --warn: #8a5a00;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 10% 0%, #e7f2ea 0%, transparent 45%),
        radial-gradient(circle at 90% 10%, #f7f1e6 0%, transparent 40%),
        var(--bg);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }}
    .card {{
      width: min(440px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 28px 24px;
      box-shadow: 0 18px 40px rgba(26, 31, 28, 0.08);
    }}
    .brand {{
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin: 0 0 10px;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: 1.55rem;
      line-height: 1.2;
    }}
    p {{ margin: 0 0 12px; color: var(--muted); line-height: 1.45; }}
    .amount {{
      margin: 18px 0 8px;
      font-size: 2rem;
      font-weight: 700;
      color: var(--ink);
    }}
    .meta {{
      font-size: 0.92rem;
      color: var(--muted);
      margin-bottom: 20px;
    }}
    .btn {{
      display: inline-flex;
      width: 100%;
      justify-content: center;
      align-items: center;
      border: 0;
      border-radius: 12px;
      padding: 14px 16px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      background: var(--accent);
      color: var(--accent-ink);
      text-decoration: none;
    }}
    .btn:hover {{ filter: brightness(1.05); }}
    .note {{
      margin-top: 14px;
      font-size: 0.85rem;
      color: var(--warn);
    }}
    .ok {{ color: var(--accent); font-weight: 600; }}
  </style>
</head>
<body>
  <main class="card">
    <p class="brand">BaseApp Pay</p>
    {body}
  </main>
</body>
</html>"""
    return HTMLResponse(html)


def _load_booking(db: Session, token: str) -> Booking | None:
    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.service),
            joinedload(Booking.tenant),
        )
        .filter(Booking.payment_token == token)
        .first()
    )


def _amount_label(booking: Booking) -> tuple[str, float]:
    currency = booking.currency or "MYR"
    amount = float(booking.deposit_amount or 0)
    if amount <= 0:
        amount = float(booking.amount or 0)
    return currency, amount


@router.get("/pay/{token}", response_class=HTMLResponse)
def pay_page(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    booking = _load_booking(db, token)
    if not booking:
        raise HTTPException(status_code=404, detail="Payment link not found")

    currency, amount = _amount_label(booking)
    service = booking.service.name if booking.service else "Booking"
    when = booking.starts_at.strftime("%d %b %Y %H:%M") if booking.starts_at else "TBC"
    ref = f"#{booking.id}"

    if booking.payment_status.value in ("paid", "deposit_paid"):
        return _page(
            "Paid",
            f"""
            <h1>Payment received</h1>
            <p class="ok">This booking is already marked as paid.</p>
            <div class="amount">{currency} {amount:.2f}</div>
            <p class="meta">{service}<br/>{when}<br/>Ref: {ref}</p>
            """,
        )

    return _page(
        "Pay deposit",
        f"""
        <h1>Confirm your booking</h1>
        <p>Pay the deposit to hold your slot.</p>
        <div class="amount">{currency} {amount:.2f}</div>
        <p class="meta">{service}<br/>{when}<br/>Ref: {ref}</p>
        <form method="post" action="/pay/{token}/complete">
          <button class="btn" type="submit">Pay now (demo)</button>
        </form>
        <p class="note">Demo checkout — no real charge. HitPay/Stripe can replace this later.</p>
        """,
    )


@router.get("/pay/{token}/status")
def pay_status(token: str, db: Session = Depends(get_db)) -> dict:
    booking = _load_booking(db, token)
    if not booking:
        raise HTTPException(status_code=404, detail="Payment link not found")
    currency, amount = _amount_label(booking)
    return {
        "booking_id": booking.id,
        "status": booking.status.value if hasattr(booking.status, "value") else booking.status,
        "payment_status": (
            booking.payment_status.value
            if hasattr(booking.payment_status, "value")
            else booking.payment_status
        ),
        "paid_at": booking.paid_at.isoformat() if booking.paid_at else None,
        "amount_due": amount,
        "currency": currency,
        "payment_url": booking.payment_url,
        "service_name": booking.service.name if booking.service else None,
    }


@router.post("/pay/{token}/complete")
def pay_complete(token: str, request: Request, db: Session = Depends(get_db)):
    booking = _load_booking(db, token)
    if not booking:
        raise HTTPException(status_code=404, detail="Payment link not found")

    if booking.payment_status.value not in ("paid", "deposit_paid"):
        mark_booking_paid(db, booking)
        db.commit()
        db.refresh(booking)

        # Same receipt template as POS — sent for every paid WhatsApp / online booking.
        try:
            deliver_booking_receipt(db, booking, persist=True)
            db.commit()
        except Exception:
            db.rollback()
            # Payment still succeeds even if receipt send fails.
            pass

    accept = request.headers.get("accept", "")
    if "application/json" in accept:
        return {
            "ok": True,
            "booking_id": booking.id,
            "status": booking.status.value if hasattr(booking.status, "value") else booking.status,
            "payment_status": (
                booking.payment_status.value
                if hasattr(booking.payment_status, "value")
                else booking.payment_status
            ),
        }
    return RedirectResponse(url=f"/pay/{token}", status_code=303)
