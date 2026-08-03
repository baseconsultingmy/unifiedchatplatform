from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import BookingStatus, Channel, PaymentStatus


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    impersonating: bool = False
    vendor_name: str | None = None


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
    is_platform: bool = False
    is_active: bool = True
    wa_phone_number_id: str | None = None
    line_channel_id: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: str
    tenant: TenantOut
    impersonating: bool = False
    impersonator_id: int | None = None
    impersonator_email: str | None = None


class VendorCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    industry: str = "wellness"
    timezone: str = "Asia/Kuala_Lumpur"
    country: str = Field(default="MY", min_length=2, max_length=2)
    owner_full_name: str = Field(min_length=2, max_length=120)
    owner_email: EmailStr
    owner_password: str = Field(min_length=8, max_length=128)
    wa_phone_number_id: str | None = None


class VendorUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    industry: str | None = None
    timezone: str | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    is_active: bool | None = None
    wa_phone_number_id: str | None = None
    line_channel_id: str | None = None


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    industry: str
    timezone: str
    country: str
    is_active: bool
    wa_phone_number_id: str | None = None
    line_channel_id: str | None = None
    created_at: datetime
    owner_email: str | None = None
    owner_name: str | None = None
    services_count: int = 0
    bookings_count: int = 0


class PlatformDashboardOut(BaseModel):
    vendors_total: int
    vendors_active: int
    bookings_total: int
    open_conversations: int
    customers_total: int


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
    deposit_amount: Decimal = Decimal("0")
    currency: str = "MYR"
    notes: str | None = None


class BookingUpdate(BaseModel):
    status: BookingStatus | None = None
    payment_status: PaymentStatus | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    amount: Decimal | None = None
    deposit_amount: Decimal | None = None
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
    deposit_amount: Decimal = Decimal("0")
    currency: str
    notes: str | None
    payment_url: str | None = None
    paid_at: datetime | None = None
    created_at: datetime
    customer: CustomerOut | None = None
    service: ServiceOut | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    direction: str
    body: str | None
    external_message_id: str | None = None
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


class SendMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4096)


class DashboardOut(BaseModel):
    bookings_total: int
    bookings_confirmed: int
    bookings_today: int
    open_conversations: int
    services_active: int
    customers_total: int
    role: str
    is_platform_admin: bool = False
