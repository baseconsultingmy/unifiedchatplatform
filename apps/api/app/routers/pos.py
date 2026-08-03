from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_vendor_user
from app.models import (
    Booking,
    BookingStatus,
    Channel,
    Conversation,
    Customer,
    Message,
    MessageDirection,
    PaymentStatus,
    Service,
    User,
)
from app.payments import amount_due, attach_payment_link
from app.receipts import (
    format_receipt_text,
    line_items_from_booking,
    normalize_phone,
    wa_click_to_chat,
)
from app.schemas import BookingOut, PosReceiptSendIn, PosReceiptSendOut, PosSaleIn, PosSaleItemIn, PosSaleOut
from app.whatsapp_client import WhatsAppSendError, send_text_message
from app.whatsapp_creds import resolve_whatsapp_credentials

router = APIRouter(prefix="/pos", tags=["pos"])


def _booking_out(db: Session, booking_id: int) -> Booking:
    return (
        db.query(Booking)
        .options(joinedload(Booking.customer), joinedload(Booking.service))
        .filter(Booking.id == booking_id)
        .one()
    )


def _normalize_items(payload: PosSaleIn) -> list[PosSaleItemIn]:
    if payload.items:
        return payload.items
    if payload.service_id is not None:
        return [PosSaleItemIn(service_id=payload.service_id, quantity=payload.quantity)]
    raise HTTPException(status_code=400, detail="Add at least one item to the cart")


@router.post("/sale", response_model=PosSaleOut, status_code=status.HTTP_201_CREATED)
def create_walkin_sale(
    payload: PosSaleIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosSaleOut:
    raw_items = _normalize_items(payload)
    # Merge duplicate service lines
    qty_by_id: dict[int, int] = {}
    for item in raw_items:
        qty_by_id[item.service_id] = qty_by_id.get(item.service_id, 0) + int(item.quantity)

    services = (
        db.query(Service)
        .filter(
            Service.tenant_id == user.tenant_id,
            Service.is_active.is_(True),
            Service.id.in_(list(qty_by_id.keys())),
        )
        .all()
    )
    by_id = {s.id: s for s in services}
    if len(by_id) != len(qty_by_id):
        raise HTTPException(status_code=404, detail="One or more catalog items were not found")

    line_labels: list[str] = []
    amount = Decimal("0")
    duration_total = 0
    currency = "MYR"
    primary: Service | None = None
    for service_id, qty in qty_by_id.items():
        service = by_id[service_id]
        if primary is None:
            primary = service
        currency = service.currency or currency
        unit = Decimal(str(service.price_amount or 0))
        amount += unit * qty
        duration_total += int(service.duration_minutes or 0) * qty
        line_labels.append(f"{qty}× {service.name}")

    assert primary is not None

    # Resolve customer
    customer: Customer | None = None
    if payload.customer_id is not None:
        customer = (
            db.query(Customer)
            .filter(Customer.id == payload.customer_id, Customer.tenant_id == user.tenant_id)
            .first()
        )
        if customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")

    phone = (payload.customer_phone or (customer.phone if customer else "") or "").strip()
    if not phone:
        phone = f"walkin-{int(datetime.now(timezone.utc).timestamp())}"

    if customer is None:
        customer = (
            db.query(Customer)
            .filter(Customer.tenant_id == user.tenant_id, Customer.phone == phone)
            .first()
        )
    if customer is None:
        customer = Customer(
            tenant_id=user.tenant_id,
            name=payload.customer_name or "Walk-in",
            phone=phone,
        )
        db.add(customer)
        db.flush()
    else:
        if payload.customer_name:
            customer.name = payload.customer_name
        if payload.customer_phone and customer.phone.startswith("walkin-"):
            # keep walk-in phone unless a real phone is provided via payload matching
            pass

    starts_at = payload.starts_at or datetime.now(timezone.utc)
    if starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    ends_at = starts_at + timedelta(minutes=max(duration_total, 15))

    deposit = Decimal(str(primary.deposit_amount or 0))
    single_item = len(qty_by_id) == 1 and next(iter(qty_by_id.values())) == 1
    use_deposit = payload.charge_mode == "deposit" and single_item and deposit > 0
    if use_deposit:
        due_deposit = deposit
        payment_status = PaymentStatus.deposit_due
    else:
        due_deposit = Decimal("0")
        payment_status = PaymentStatus.unpaid

    cart_note = "POS · " + ", ".join(line_labels)
    notes = " · ".join([x for x in [payload.notes, cart_note] if x])

    booking = Booking(
        tenant_id=user.tenant_id,
        customer_id=customer.id,
        service_id=primary.id,
        channel=Channel.manual,
        status=BookingStatus.confirmed,
        payment_status=payment_status,
        starts_at=starts_at,
        ends_at=ends_at,
        amount=amount if not use_deposit else Decimal(str(primary.price_amount or 0)),
        deposit_amount=due_deposit,
        currency=currency,
        notes=notes,
        external_ref=f"pos-{int(datetime.now(timezone.utc).timestamp())}",
    )
    # For deposit on single item, amount should still be full price
    if use_deposit:
        booking.amount = Decimal(str(primary.price_amount or 0))

    db.add(booking)
    db.flush()
    attach_payment_link(db, booking)

    already_paid = False
    if payload.payment_method == "cash":
        if use_deposit and due_deposit > 0 and due_deposit < Decimal(str(booking.amount or 0)):
            booking.payment_status = PaymentStatus.deposit_paid
        else:
            booking.payment_status = PaymentStatus.paid
        booking.status = BookingStatus.confirmed
        booking.paid_at = datetime.now(timezone.utc)
        already_paid = True

    db.commit()
    booking = _booking_out(db, booking.id)
    due = amount_due(booking)
    return PosSaleOut(
        booking=BookingOut.model_validate(booking),
        payment_method=payload.payment_method,
        amount_due=due,
        currency=booking.currency,
        payment_url=booking.payment_url,
        already_paid=already_paid,
        line_items=line_labels,
    )


def _normalize_phone(raw: str | None, *, default_country: str = "60") -> str | None:
    return normalize_phone(raw, default_country=default_country)


def _wa_click_to_chat(phone: str, body: str) -> str:
    return wa_click_to_chat(phone, body)


def _line_items_from_booking(booking: Booking) -> list[str]:
    return line_items_from_booking(booking)


def _format_receipt_text(
    *,
    booking: Booking,
    line_items: list[str],
    cash_received: Decimal | None,
    change: Decimal | None,
) -> str:
    return format_receipt_text(
        booking=booking,
        line_items=line_items,
        cash_received=cash_received,
        change=change,
    )


@router.post(
    "/sale/{booking_id}/receipt/whatsapp",
    response_model=PosReceiptSendOut,
)
def send_sale_receipt_whatsapp(
    booking_id: int,
    payload: PosReceiptSendIn,
    user: User = Depends(require_vendor_user),
    db: Session = Depends(get_db),
) -> PosReceiptSendOut:
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.service),
            joinedload(Booking.tenant),
        )
        .filter(Booking.id == booking_id, Booking.tenant_id == user.tenant_id)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Sale not found")

    phone = _normalize_phone(payload.phone) or _normalize_phone(
        booking.customer.phone if booking.customer else None
    )
    if not phone:
        raise HTTPException(
            status_code=400,
            detail="Add a valid customer WhatsApp number before sending the receipt",
        )

    if booking.customer and (
        not booking.customer.phone or booking.customer.phone.startswith("walkin-")
    ):
        booking.customer.phone = phone
        if payload.phone and not booking.customer.name:
            booking.customer.name = "WhatsApp guest"

    line_items = _line_items_from_booking(booking)
    body = _format_receipt_text(
        booking=booking,
        line_items=line_items,
        cash_received=payload.cash_received,
        change=payload.change,
    )

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.tenant_id == user.tenant_id,
            Conversation.channel == Channel.whatsapp,
            Conversation.external_thread_id == phone,
        )
        .first()
    )
    if conversation is None:
        conversation = Conversation(
            tenant_id=user.tenant_id,
            customer_id=booking.customer_id,
            channel=Channel.whatsapp,
            external_thread_id=phone,
            status="open",
            flow_state="idle",
        )
        db.add(conversation)
        db.flush()
    elif booking.customer_id and not conversation.customer_id:
        conversation.customer_id = booking.customer_id

    # Persist customer/conversation updates even if Cloud API send fails.
    db.commit()
    db.refresh(conversation)

    access_token, phone_number_id = resolve_whatsapp_credentials(user.tenant)
    wa_url = _wa_click_to_chat(phone, body)
    try:
        result = send_text_message(
            to_phone=phone,
            body=body,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
    except WhatsAppSendError as exc:
        # Common when Meta token expired or outside 24h session — still give a working send path.
        return PosReceiptSendOut(
            ok=True,
            booking_id=booking.id,
            sent_to=phone,
            body=body,
            delivered_via="wa_link",
            wa_url=wa_url,
            message=str(exc) or "Opened WhatsApp link instead of Cloud API",
        )

    external_id = None
    messages = result.get("messages") or []
    if messages:
        external_id = messages[0].get("id")

    now = datetime.now(timezone.utc)
    message = Message(
        conversation_id=conversation.id,
        direction=MessageDirection.outbound,
        body=body,
        raw_payload=json.dumps(result),
        external_message_id=external_id,
    )
    conversation.last_message_at = now
    conversation.status = "open"
    db.add(message)
    db.commit()

    return PosReceiptSendOut(
        ok=True,
        booking_id=booking.id,
        sent_to=phone,
        body=body,
        delivered_via="api",
        wa_url=wa_url,
        message="Receipt sent via WhatsApp Business API",
    )
