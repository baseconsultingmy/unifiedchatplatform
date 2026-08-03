from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import BookingStatus, Channel, PaymentStatus


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    industry: str
    timezone: str
    country: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: str
    tenant: TenantOut


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    duration_minutes: int = 60
    price_amount: Decimal = Decimal("0")
    currency: str = "MYR"
    deposit_amount: Decimal = Decimal("0")
    is_active: bool = True


class ServiceOut(ServiceIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CustomerIn(BaseModel):
    name: str | None = None
    phone: str = Field(min_length=6, max_length=32)
    email: EmailStr | None = None
    notes: str | None = None


class CustomerOut(CustomerIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class BookingIn(BaseModel):
    customer_id: int
    service_id: int | None = None
    channel: Channel = Channel.manual
    status: BookingStatus = BookingStatus.inquiry
    payment_status: PaymentStatus = PaymentStatus.unpaid
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    amount: Decimal = Decimal("0")
    currency: str = "MYR"
    notes: str | None = None


class BookingUpdate(BaseModel):
    status: BookingStatus | None = None
    payment_status: PaymentStatus | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    amount: Decimal | None = None
    notes: str | None = None
    service_id: int | None = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    service_id: int | None
    channel: Channel
    status: BookingStatus
    payment_status: PaymentStatus
    starts_at: datetime | None
    ends_at: datetime | None
    amount: Decimal
    currency: str
    notes: str | None
    created_at: datetime
    customer: CustomerOut | None = None
    service: ServiceOut | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    direction: str
    body: str | None
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    channel: Channel
    external_thread_id: str
    status: str
    last_message_at: datetime | None
    customer: CustomerOut | None = None
    messages: list[MessageOut] = []


class DashboardOut(BaseModel):
    bookings_total: int
    bookings_confirmed: int
    bookings_today: int
    open_conversations: int
    services_active: int
    customers_total: int
