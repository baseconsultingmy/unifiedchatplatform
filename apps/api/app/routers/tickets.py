"""Open table tickets — customize, send to kitchen, pay later."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.kitchen_slip import format_kitchen_slip
from app.models import (
    KitchenPrintJob,
    ModifierOption,
    PosTicket,
    PosTicketLine,
    PosTicketLineMod,
    PosTicketStatus,
    Service,
    Tenant,
    User,
)
from app.schemas import (
    KitchenSendOut,
    PosTicketAddLinesIn,
    PosTicketCreateIn,
    PosTicketLineIn,
    PosTicketOut,
)

router = APIRouter(prefix="/pos/tickets", tags=["pos-tickets"])


def _ticket_query(db: Session, tenant_id: int):
    return (
        db.query(PosTicket)
        .options(
            joinedload(PosTicket.lines).joinedload(PosTicketLine.mods),
        )
        .filter(PosTicket.tenant_id == tenant_id)
    )


def _recalc(ticket: PosTicket) -> None:
    subtotal = Decimal("0")
    for line in ticket.lines or []:
        subtotal += Decimal(str(line.line_total or 0))
    ticket.subtotal_amount = float(subtotal)
    ticket.total_amount = float(subtotal)


def _options_map(db: Session, option_ids: list[int], tenant_id: int) -> dict[int, ModifierOption]:
    if not option_ids:
        return {}
    rows = (
        db.query(ModifierOption)
        .options(joinedload(ModifierOption.group))
        .filter(
            ModifierOption.id.in_(option_ids),
            ModifierOption.is_active.is_(True),
        )
        .all()
    )
    # Ensure options belong to tenant services
    out: dict[int, ModifierOption] = {}
    for opt in rows:
        if opt.group.tenant_id == tenant_id:
            out[opt.id] = opt
    return out


def _add_lines(
    db: Session,
    ticket: PosTicket,
    lines: list[PosTicketLineIn],
    tenant_id: int,
) -> None:
    service_ids = [ln.service_id for ln in lines]
    services = {
        s.id: s
        for s in db.query(Service)
        .filter(
            Service.tenant_id == tenant_id,
            Service.id.in_(service_ids),
            Service.is_active.is_(True),
        )
        .all()
    }
    if len(services) != len(set(service_ids)):
        raise HTTPException(status_code=404, detail="One or more menu items were not found")

    all_opt_ids = [oid for ln in lines for oid in (ln.option_ids or [])]
    options = _options_map(db, all_opt_ids, tenant_id)

    for ln in lines:
        service = services[ln.service_id]
        unit = Decimal(str(service.price_amount or 0))
        mod_names: list[str] = []
        chosen: list[ModifierOption] = []
        for oid in ln.option_ids or []:
            opt = options.get(oid)
            if opt is None:
                raise HTTPException(status_code=400, detail=f"Invalid modifier option {oid}")
            if opt.group.service_id != service.id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Modifier '{opt.name}' is not for {service.name}",
                )
            unit += Decimal(str(opt.price_delta or 0))
            mod_names.append(opt.name)
            chosen.append(opt)
        qty = int(ln.quantity)
        remarks = (ln.remarks or "").strip() or None
        if mod_names and not remarks:
            remarks = ", ".join(mod_names)
        elif mod_names and remarks:
            remarks = f"{', '.join(mod_names)} · {remarks}"
        line = PosTicketLine(
            ticket_id=ticket.id,
            service_id=service.id,
            name=service.name,
            quantity=qty,
            unit_price=float(unit),
            line_total=float(unit * qty),
            remarks=remarks,
        )
        db.add(line)
        db.flush()
        for opt in chosen:
            db.add(
                PosTicketLineMod(
                    line_id=line.id,
                    option_id=opt.id,
                    name=opt.name,
                    price_delta=float(opt.price_delta or 0),
                )
            )
    db.flush()
    # refresh lines collection
    db.refresh(ticket)
    ticket.lines = (
        db.query(PosTicketLine)
        .options(joinedload(PosTicketLine.mods))
        .filter(PosTicketLine.ticket_id == ticket.id)
        .all()
    )
    _recalc(ticket)


@router.get("", response_model=list[PosTicketOut])
def list_tickets(
    status: str | None = Query(default="open"),
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> list[PosTicket]:
    q = _ticket_query(db, user.tenant_id)
    if status == "open":
        q = q.filter(
            PosTicket.status.in_(
                [
                    PosTicketStatus.open.value,
                    PosTicketStatus.kitchen.value,
                    PosTicketStatus.awaiting_payment.value,
                ]
            )
        )
    elif status and status != "all":
        q = q.filter(PosTicket.status == status)
    return q.order_by(PosTicket.updated_at.desc()).limit(100).all()


@router.post("", response_model=PosTicketOut, status_code=201)
def create_ticket(
    payload: PosTicketCreateIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosTicket:
    label = (payload.table_label or "Takeaway").strip() or "Takeaway"
    # Reuse open ticket on same table if present
    existing = (
        _ticket_query(db, user.tenant_id)
        .filter(
            PosTicket.table_label == label,
            PosTicket.status.in_(
                [
                    PosTicketStatus.open.value,
                    PosTicketStatus.kitchen.value,
                    PosTicketStatus.awaiting_payment.value,
                ]
            ),
        )
        .first()
    )
    if existing:
        if payload.lines:
            _add_lines(db, existing, payload.lines, user.tenant_id)
        if payload.notes:
            existing.notes = payload.notes
        db.commit()
        return _ticket_query(db, user.tenant_id).filter(PosTicket.id == existing.id).one()

    ticket = PosTicket(
        tenant_id=user.tenant_id,
        table_label=label,
        status=PosTicketStatus.open.value,
        notes=payload.notes,
        currency="MYR",
    )
    db.add(ticket)
    db.flush()
    if payload.lines:
        _add_lines(db, ticket, payload.lines, user.tenant_id)
    db.commit()
    return _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket.id).one()


@router.get("/{ticket_id}", response_model=PosTicketOut)
def get_ticket(
    ticket_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosTicket:
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.post("/{ticket_id}/lines", response_model=PosTicketOut)
def add_ticket_lines(
    ticket_id: int,
    payload: PosTicketAddLinesIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosTicket:
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status in (PosTicketStatus.paid.value, PosTicketStatus.cancelled.value):
        raise HTTPException(status_code=400, detail="Ticket is closed")
    _add_lines(db, ticket, payload.lines, user.tenant_id)
    if payload.notes is not None:
        ticket.notes = payload.notes
    if ticket.status == PosTicketStatus.kitchen.value:
        ticket.status = PosTicketStatus.open.value  # new items need another kitchen fire
    db.commit()
    return _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket.id).one()


@router.put("/{ticket_id}/lines", response_model=PosTicketOut)
def replace_ticket_lines(
    ticket_id: int,
    payload: PosTicketAddLinesIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosTicket:
    """Replace all lines after staff review/edit before payment."""
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status in (PosTicketStatus.paid.value, PosTicketStatus.cancelled.value):
        raise HTTPException(status_code=400, detail="Ticket is closed")
    db.query(PosTicketLine).filter(PosTicketLine.ticket_id == ticket.id).delete(
        synchronize_session=False
    )
    db.flush()
    ticket.lines = []
    _add_lines(db, ticket, payload.lines, user.tenant_id)
    if payload.notes is not None:
        ticket.notes = payload.notes
    ticket.status = PosTicketStatus.open.value
    db.commit()
    return _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket.id).one()


@router.post("/{ticket_id}/send-kitchen", response_model=KitchenSendOut)
def send_to_kitchen(
    ticket_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> KitchenSendOut:
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not ticket.lines:
        raise HTTPException(status_code=400, detail="Add items before sending to kitchen")
    if ticket.status in (PosTicketStatus.paid.value, PosTicketStatus.cancelled.value):
        raise HTTPException(status_code=400, detail="Ticket is closed")

    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    slip = format_kitchen_slip(ticket, shop_name=(tenant.name if tenant else "Kitchen"))
    now = datetime.now(timezone.utc)
    job = KitchenPrintJob(
        tenant_id=user.tenant_id,
        ticket_id=ticket.id,
        status="queued",
        trigger="send_kitchen",
        slip_text=slip,
    )
    db.add(job)
    ticket.status = PosTicketStatus.kitchen.value
    ticket.kitchen_sent_at = now
    db.commit()
    db.refresh(job)
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).one()
    return KitchenSendOut(
        ok=True,
        ticket=PosTicketOut.model_validate(ticket),
        print_job_id=job.id,
        slip_text=slip,
        message="Kitchen slip queued — print from the POS dialog",
    )


@router.post("/{ticket_id}/awaiting-payment", response_model=PosTicketOut)
def mark_awaiting_payment(
    ticket_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosTicket:
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status in (PosTicketStatus.paid.value, PosTicketStatus.cancelled.value):
        raise HTTPException(status_code=400, detail="Ticket is closed")
    ticket.status = PosTicketStatus.awaiting_payment.value
    db.commit()
    return _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).one()


@router.post("/{ticket_id}/cancel", response_model=PosTicketOut)
def cancel_ticket(
    ticket_id: int,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosTicket:
    ticket = _ticket_query(db, user.tenant_id).filter(PosTicket.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status == PosTicketStatus.paid.value:
        raise HTTPException(status_code=400, detail="Paid tickets cannot be cancelled")
    ticket.status = PosTicketStatus.cancelled.value
    db.commit()
    return ticket
