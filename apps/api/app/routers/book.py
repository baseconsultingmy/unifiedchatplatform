from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.availability import (
    available_slots,
    busy_bookings,
    date_label,
    dates_with_availability,
    slot_conflicts,
    tenant_tz,
)
from app.book_links import verify_book_sig
from app.db import get_db
from app.models import (
    Booking,
    BookingStatus,
    Channel,
    Conversation,
    Customer,
    PaymentStatus,
    Service,
    Tenant,
)
from app.payments import amount_due, attach_payment_link

router = APIRouter(tags=["book"])


def _tenant(db: Session, slug: str) -> Tenant:
    tenant = (
        db.query(Tenant)
        .filter(Tenant.slug == slug, Tenant.is_platform.is_(False), Tenant.is_active.is_(True))
        .first()
    )
    if tenant is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return tenant


class BookReserveIn(BaseModel):
    service_id: int
    starts_at: str  # ISO datetime with offset
    customer_name: str | None = Field(default=None, max_length=120)
    wa: str = Field(min_length=8, max_length=32)
    sig: str = Field(min_length=8, max_length=64)


@router.get("/book/{slug}/catalog")
def book_catalog(slug: str, db: Session = Depends(get_db)) -> dict:
    tenant = _tenant(db, slug)
    services = (
        db.query(Service)
        .filter(Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .order_by(Service.id.asc())
        .all()
    )
    return {
        "shop": tenant.name,
        "timezone": tenant.timezone,
        "packages": [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "duration_minutes": s.duration_minutes,
                "price_amount": float(s.price_amount or 0),
                "deposit_amount": float(s.deposit_amount or 0),
                "currency": s.currency or "MYR",
                "category": s.category,
            }
            for s in services
        ],
    }


@router.get("/book/{slug}/dates")
def book_dates(
    slug: str,
    service_id: int = Query(...),
    db: Session = Depends(get_db),
) -> dict:
    tenant = _tenant(db, slug)
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Package not found")

    tz = tenant_tz(tenant)
    today = datetime.now(tz).date()
    days = dates_with_availability(
        db,
        tenant,
        duration_minutes=int(service.duration_minutes or 60),
        days=14,
    )
    return {
        "service_id": service.id,
        "dates": [
            {
                "id": d.isoformat(),
                "label": date_label(d, today),
                "description": d.strftime("%d %b %Y"),
            }
            for d in days
        ],
    }


@router.get("/book/{slug}/slots")
def book_slots(
    slug: str,
    service_id: int = Query(...),
    day: str = Query(..., description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
) -> dict:
    tenant = _tenant(db, slug)
    service = (
        db.query(Service)
        .filter(Service.id == service_id, Service.tenant_id == tenant.id, Service.is_active.is_(True))
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Package not found")
    try:
        day_value = date.fromisoformat(day)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid day") from exc

    slots = available_slots(
        db,
        tenant,
        day=day_value,
        duration_minutes=int(service.duration_minutes or 60),
    )
    return {
        "service_id": service.id,
        "day": day_value.isoformat(),
        "slots": [
            {
                "id": s.isoformat(),
                "label": s.strftime("%I:%M %p").lstrip("0"),
            }
            for s in slots
        ],
    }


@router.post("/book/{slug}/reserve")
def book_reserve(slug: str, payload: BookReserveIn, db: Session = Depends(get_db)) -> dict:
    tenant = _tenant(db, slug)
    phone = "".join(ch for ch in payload.wa if ch.isdigit())
    if not verify_book_sig(slug, phone, payload.sig):
        raise HTTPException(status_code=403, detail="Invalid booking link")

    service = (
        db.query(Service)
        .filter(
            Service.id == payload.service_id,
            Service.tenant_id == tenant.id,
            Service.is_active.is_(True),
        )
        .first()
    )
    if service is None:
        raise HTTPException(status_code=404, detail="Package not found")

    try:
        starts_at = datetime.fromisoformat(payload.starts_at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid starts_at") from exc
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=tenant_tz(tenant))

    duration = int(service.duration_minutes or 60)
    ends_at = starts_at + timedelta(minutes=duration)

    # Only allow currently available slots (sold-out / past never bookable).
    day_slots = available_slots(
        db,
        tenant,
        day=starts_at.astimezone(tenant_tz(tenant)).date(),
        duration_minutes=duration,
    )
    allowed = {s.astimezone(timezone.utc).replace(second=0, microsecond=0) for s in day_slots}
    check = starts_at.astimezone(timezone.utc).replace(second=0, microsecond=0)
    if check not in allowed:
        # Also compare by minute equality loosely
        if not any(
            abs((s.astimezone(timezone.utc) - starts_at.astimezone(timezone.utc)).total_seconds()) < 60
            for s in day_slots
        ):
            raise HTTPException(status_code=409, detail="That slot is no longer available")

    busy = busy_bookings(
        db,
        tenant.id,
        starts_at.astimezone(timezone.utc) - timedelta(minutes=1),
        ends_at.astimezone(timezone.utc) + timedelta(minutes=1),
    )
    if slot_conflicts(starts_at.astimezone(timezone.utc), ends_at.astimezone(timezone.utc), busy):
        raise HTTPException(status_code=409, detail="That slot was just taken")

    customer = (
        db.query(Customer)
        .filter(Customer.tenant_id == tenant.id, Customer.phone == phone)
        .first()
    )
    if customer is None:
        customer = Customer(
            tenant_id=tenant.id,
            phone=phone,
            name=(payload.customer_name or "").strip() or "WhatsApp guest",
        )
        db.add(customer)
        db.flush()
    elif payload.customer_name and payload.customer_name.strip():
        customer.name = payload.customer_name.strip()

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.tenant_id == tenant.id,
            Conversation.channel == Channel.whatsapp,
            Conversation.external_thread_id == phone,
        )
        .first()
    )
    if conversation is None:
        conversation = Conversation(
            tenant_id=tenant.id,
            customer_id=customer.id,
            channel=Channel.whatsapp,
            external_thread_id=phone,
            status="open",
            flow_state="idle",
        )
        db.add(conversation)
        db.flush()
    else:
        conversation.customer_id = customer.id
        conversation.flow_state = "idle"

    deposit = Decimal(str(service.deposit_amount or 0))
    booking = Booking(
        tenant_id=tenant.id,
        customer_id=customer.id,
        service_id=service.id,
        channel=Channel.whatsapp,
        status=BookingStatus.held,
        payment_status=PaymentStatus.deposit_due if deposit > 0 else PaymentStatus.unpaid,
        starts_at=starts_at,
        ends_at=ends_at,
        amount=Decimal(str(service.price_amount or 0)),
        deposit_amount=deposit,
        currency=service.currency or "MYR",
        notes=starts_at.astimezone(tenant_tz(tenant)).strftime("%a %d %b · %I:%M %p").replace(" 0", " "),
        external_ref=f"web-{phone}-{int(datetime.now(timezone.utc).timestamp())}",
    )
    db.add(booking)
    db.flush()
    attach_payment_link(db, booking)
    db.commit()
    db.refresh(booking)

    due = amount_due(booking)
    return {
        "ok": True,
        "booking_id": booking.id,
        "payment_url": booking.payment_url,
        "amount_due": float(due),
        "currency": booking.currency,
        "service_name": service.name,
        "when": booking.notes,
    }


def _page(shop_name: str, slug: str, wa: str, sig: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Book · {shop_name}</title>
  <style>
    :root {{
      --ink:#14201c; --muted:#5b6b64; --line:rgba(20,32,28,.12);
      --bg:#eef5f1; --card:#fff; --accent:#0f766e; --accent-ink:#fff;
      --warn:#b45309; --ok:#15803d;
    }}
    * {{ box-sizing:border-box; }}
    body {{
      margin:0; font-family:"Segoe UI", system-ui, sans-serif; color:var(--ink);
      background:
        radial-gradient(900px 420px at 10% -10%, rgba(15,118,110,.16), transparent 55%),
        radial-gradient(700px 380px at 100% 0%, rgba(194,65,12,.10), transparent 50%),
        var(--bg);
      min-height:100dvh; padding:16px;
    }}
    .sheet {{
      width:min(520px, 100%); margin:0 auto; background:var(--card);
      border:1px solid var(--line); border-radius:22px; box-shadow:0 18px 50px rgba(20,32,28,.08);
      overflow:hidden;
    }}
    .head {{ padding:1.1rem 1.15rem .85rem; border-bottom:1px solid var(--line); }}
    .head .muted {{ color:var(--muted); font-size:.92rem; margin:.15rem 0 0; }}
    h1 {{ margin:0; font-size:1.35rem; letter-spacing:-.02em; }}
    .steps {{
      display:grid; grid-template-columns:repeat(4,1fr); gap:.35rem; padding:.75rem 1rem 0;
    }}
    .step {{
      text-align:center; font-size:.72rem; color:var(--muted); padding:.35rem .2rem;
      border-bottom:2px solid var(--line);
    }}
    .step.on {{ color:var(--accent); border-color:var(--accent); font-weight:600; }}
    .step.done {{ color:var(--ok); border-color:var(--ok); }}
    .body {{ padding:1rem 1.1rem 1.25rem; display:grid; gap:.85rem; }}
    .panel {{ display:none; gap:.65rem; }}
    .panel.on {{ display:grid; }}
    .choice {{
      display:grid; gap:.15rem; text-align:left; width:100%;
      border:1px solid var(--line); border-radius:14px; padding:.85rem .95rem;
      background:#fbfcfb; color:var(--ink); cursor:pointer;
    }}
    .choice:hover {{ border-color:rgba(15,118,110,.45); }}
    .choice.selected {{ border-color:var(--accent); background:rgba(15,118,110,.06); }}
    .choice:disabled, .choice.soldout {{
      opacity:.45; cursor:not-allowed; text-decoration:none;
    }}
    .choice strong {{ font-size:1rem; }}
    .choice span {{ color:var(--muted); font-size:.88rem; }}
    .grid-times {{
      display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.45rem;
    }}
    .grid-times .choice {{ padding:.7rem .4rem; text-align:center; }}
    .summary {{
      border:1px solid var(--line); border-radius:14px; padding:.9rem 1rem; background:#f7faf8;
      display:grid; gap:.35rem;
    }}
    label {{ display:grid; gap:.35rem; font-size:.9rem; color:var(--muted); }}
    input {{
      border:1px solid var(--line); border-radius:12px; padding:.7rem .8rem; font:inherit; color:var(--ink);
    }}
    .actions {{ display:grid; gap:.5rem; margin-top:.25rem; }}
    .btn {{
      border:0; border-radius:12px; padding:.85rem 1rem; font:inherit; font-weight:600;
      background:var(--accent); color:var(--accent-ink); cursor:pointer;
    }}
    .btn.secondary {{ background:#fff; color:var(--ink); border:1px solid var(--line); }}
    .btn:disabled {{ opacity:.5; cursor:not-allowed; }}
    .error {{ color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:.7rem .8rem; }}
    .empty {{ color:var(--muted); padding:.5rem 0; }}
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <h1 id="shopName">{shop_name}</h1>
      <p class="muted">Book in one screen — package, date, time, then pay.</p>
    </div>
    <div class="steps">
      <div class="step on" data-step="1">Package</div>
      <div class="step" data-step="2">Date</div>
      <div class="step" data-step="3">Time</div>
      <div class="step" data-step="4">Confirm</div>
    </div>
    <div class="body">
      <div id="error" class="error" hidden></div>

      <section class="panel on" id="panel-package"></section>
      <section class="panel" id="panel-date"></section>
      <section class="panel" id="panel-slot"></section>
      <section class="panel" id="panel-confirm">
        <div class="summary" id="summary"></div>
        <label>Your name (optional)
          <input id="customerName" placeholder="Name for the booking" />
        </label>
        <div class="actions">
          <button class="btn" id="payBtn" type="button">Confirm &amp; pay</button>
          <button class="btn secondary" id="backBtn" type="button">Back</button>
        </div>
      </section>
    </div>
  </div>
  <script>
    const SLUG = {slug!r};
    const WA = {wa!r};
    const SIG = {sig!r};
    const state = {{ package:null, date:null, slot:null }};
    const els = {{
      error: document.getElementById('error'),
      package: document.getElementById('panel-package'),
      date: document.getElementById('panel-date'),
      slot: document.getElementById('panel-slot'),
      confirm: document.getElementById('panel-confirm'),
      summary: document.getElementById('summary'),
      payBtn: document.getElementById('payBtn'),
      backBtn: document.getElementById('backBtn'),
      name: document.getElementById('customerName'),
      steps: [...document.querySelectorAll('.step')],
    }};

    function showError(msg) {{
      els.error.hidden = !msg;
      els.error.textContent = msg || '';
    }}

    function setStep(n) {{
      ['package','date','slot','confirm'].forEach((k, i) => {{
        els[k].classList.toggle('on', i+1 === n);
      }});
      els.steps.forEach((s) => {{
        const sn = Number(s.dataset.step);
        s.classList.toggle('on', sn === n);
        s.classList.toggle('done', sn < n);
      }});
      showError('');
    }}

    async function api(path) {{
      const res = await fetch(path);
      const data = await res.json().catch(() => ({{}}));
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      return data;
    }}

    function choiceButton({{ title, subtitle, onClick, selected=false }}) {{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice' + (selected ? ' selected' : '');
      btn.innerHTML = `<strong>${{title}}</strong>` + (subtitle ? `<span>${{subtitle}}</span>` : '');
      btn.addEventListener('click', onClick);
      return btn;
    }}

    async function loadPackages() {{
      const data = await api(`/book/${{SLUG}}/catalog`);
      document.getElementById('shopName').textContent = data.shop;
      els.package.innerHTML = '';
      if (!data.packages.length) {{
        els.package.innerHTML = '<p class="empty">No packages available right now.</p>';
        return;
      }}
      data.packages.forEach((p) => {{
        const deposit = p.deposit_amount > 0 ? ` · deposit ${{p.currency}} ${{p.deposit_amount.toFixed(2)}}` : '';
        els.package.appendChild(choiceButton({{
          title: p.name,
          subtitle: `${{p.duration_minutes}} min · ${{p.currency}} ${{p.price_amount.toFixed(2)}}${{deposit}}`,
          selected: state.package?.id === p.id,
          onClick: async () => {{
            state.package = p;
            state.date = null;
            state.slot = null;
            setStep(2);
            await loadDates();
          }},
        }}));
      }});
    }}

    async function loadDates() {{
      els.date.innerHTML = '<p class="empty">Loading dates…</p>';
      const data = await api(`/book/${{SLUG}}/dates?service_id=${{state.package.id}}`);
      els.date.innerHTML = '';
      const back = document.createElement('button');
      back.type = 'button'; back.className = 'btn secondary'; back.textContent = 'Back to packages';
      back.onclick = () => {{ setStep(1); }};
      if (!data.dates.length) {{
        els.date.innerHTML = '<p class="empty">No dates with open slots for this package.</p>';
        els.date.appendChild(back);
        return;
      }}
      data.dates.forEach((d) => {{
        els.date.appendChild(choiceButton({{
          title: d.label,
          subtitle: d.description,
          selected: state.date?.id === d.id,
          onClick: async () => {{
            state.date = d;
            state.slot = null;
            setStep(3);
            await loadSlots();
          }},
        }}));
      }});
      els.date.appendChild(back);
    }}

    async function loadSlots() {{
      els.slot.innerHTML = '<p class="empty">Loading times…</p>';
      const data = await api(`/book/${{SLUG}}/slots?service_id=${{state.package.id}}&day=${{state.date.id}}`);
      els.slot.innerHTML = '';
      const back = document.createElement('button');
      back.type = 'button'; back.className = 'btn secondary'; back.textContent = 'Back to dates';
      back.onclick = () => {{ setStep(2); }};
      if (!data.slots.length) {{
        els.slot.innerHTML = '<p class="empty">No open times on this date. Pick another date.</p>';
        els.slot.appendChild(back);
        return;
      }}
      const grid = document.createElement('div');
      grid.className = 'grid-times';
      data.slots.forEach((s) => {{
        grid.appendChild(choiceButton({{
          title: s.label,
          selected: state.slot?.id === s.id,
          onClick: () => {{
            state.slot = s;
            renderSummary();
            setStep(4);
          }},
        }}));
      }});
      els.slot.appendChild(grid);
      els.slot.appendChild(back);
    }}

    function renderSummary() {{
      const p = state.package;
      const deposit = p.deposit_amount > 0
        ? `<div>Deposit due now: <strong>${{p.currency}} ${{p.deposit_amount.toFixed(2)}}</strong></div>`
        : `<div>Total: <strong>${{p.currency}} ${{p.price_amount.toFixed(2)}}</strong></div>`;
      els.summary.innerHTML = `
        <div><span class="muted">Package</span><br/><strong>${{p.name}}</strong></div>
        <div><span class="muted">When</span><br/><strong>${{state.date.label}} · ${{state.slot.label}}</strong></div>
        <div><span class="muted">Duration</span><br/><strong>${{p.duration_minutes}} min</strong></div>
        ${{deposit}}
      `;
    }}

    els.backBtn.addEventListener('click', () => setStep(3));
    els.payBtn.addEventListener('click', async () => {{
      showError('');
      els.payBtn.disabled = true;
      els.payBtn.textContent = 'Holding slot…';
      try {{
        const res = await fetch(`/book/${{SLUG}}/reserve`, {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{
            service_id: state.package.id,
            starts_at: state.slot.id,
            customer_name: els.name.value.trim() || null,
            wa: WA,
            sig: SIG,
          }}),
        }});
        const data = await res.json().catch(() => ({{}}));
        if (!res.ok) throw new Error(data.detail || 'Could not reserve slot');
        window.location.href = data.payment_url;
      }} catch (err) {{
        showError(err.message || 'Could not reserve slot');
        els.payBtn.disabled = false;
        els.payBtn.textContent = 'Confirm & pay';
        // Refresh slots in case it sold out
        if (state.date) loadSlots().catch(() => {{}});
      }}
    }});

    if (!WA || !SIG) {{
      showError('Open this booking page from your WhatsApp chat link so we can match your number.');
    }} else {{
      loadPackages().catch((e) => showError(e.message));
    }}
  </script>
</body>
</html>"""


@router.get("/book/{slug}", response_class=HTMLResponse)
def book_page(
    slug: str,
    wa: str | None = None,
    sig: str | None = None,
    db: Session = Depends(get_db),
) -> HTMLResponse:
    tenant = _tenant(db, slug)
    phone = "".join(ch for ch in (wa or "") if ch.isdigit())
    valid = verify_book_sig(slug, phone, sig)
    return HTMLResponse(
        _page(
            shop_name=tenant.name,
            slug=tenant.slug,
            wa=phone if valid else "",
            sig=sig if valid else "",
        )
    )
