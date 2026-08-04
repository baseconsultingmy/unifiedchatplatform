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
    wa_business_account_id: str | None = None
    wa_flow_id: str | None = None
    wa_display_phone: str | None = None
    wa_verify_token: str | None = None
    wa_webhook_status: str = "not_configured"
    wa_connected_at: datetime | None = None
    wa_access_token_set: bool = False
    line_channel_id: str | None = None
    grab_merchant_id: str | None = None
    grab_markup_percent: float = 30
    grab_sync_status: str = "not_configured"
    grab_last_synced_at: datetime | None = None
    grab_activation_url: str | None = None
    grab_partner_token_set: bool = False


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


class WhatsAppFieldsIn(BaseModel):
    """Shared WhatsApp credential write fields (token is write-only)."""

    wa_phone_number_id: str | None = None
    wa_access_token: str | None = None
    clear_wa_access_token: bool = False
    wa_business_account_id: str | None = None
    wa_flow_id: str | None = None
    wa_display_phone: str | None = None
    wa_verify_token: str | None = None
    wa_webhook_status: str | None = None


class VendorCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, max_length=80)
    industry: str = "health_beauty"
    timezone: str = "Asia/Kuala_Lumpur"
    country: str = Field(default="MY", min_length=2, max_length=2)
    owner_full_name: str = Field(min_length=2, max_length=120)
    owner_email: EmailStr
    owner_password: str = Field(min_length=8, max_length=128)
    wa_phone_number_id: str | None = None
    wa_access_token: str | None = None
    wa_business_account_id: str | None = None
    wa_flow_id: str | None = None
    wa_display_phone: str | None = None
    wa_verify_token: str | None = None


class VendorUpdateIn(WhatsAppFieldsIn):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    industry: str | None = None
    timezone: str | None = None
    country: str | None = Field(default=None, min_length=2, max_length=2)
    is_active: bool | None = None
    line_channel_id: str | None = None
    grab_merchant_id: str | None = None
    grab_markup_percent: Decimal | None = None
    grab_sync_status: str | None = None
    grab_partner_token: str | None = None
    clear_grab_partner_token: bool = False


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
    wa_business_account_id: str | None = None
    wa_flow_id: str | None = None
    wa_display_phone: str | None = None
    wa_verify_token: str | None = None
    wa_webhook_status: str = "not_configured"
    wa_connected_at: datetime | None = None
    wa_access_token_set: bool = False
    line_channel_id: str | None = None
    grab_merchant_id: str | None = None
    grab_markup_percent: float = 30
    grab_sync_status: str = "not_configured"
    grab_last_synced_at: datetime | None = None
    grab_activation_url: str | None = None
    grab_partner_token_set: bool = False
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


class PlatformMetaOut(BaseModel):
    """Master Admin read-only view of platform Meta / WhatsApp defaults."""

    webhook_url: str
    flows_endpoint_url: str
    platform_verify_token: str
    app_secret_set: bool
    platform_access_token_set: bool
    platform_phone_number_id: str | None = None
    flow_crypto_configured: bool = False
    grab_credentials_set: bool = False
    vendors_with_phone_id: int = 0
    vendors_with_token: int = 0
    vendors_with_flow: int = 0
    vendors_verified: int = 0
    vendors_with_grab: int = 0
    notes: list[str] = []


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    duration_minutes: int = 60
    price_amount: Decimal = Decimal("0")
    currency: str = "MYR"
    deposit_amount: Decimal = Decimal("0")
    category: str | None = Field(default=None, max_length=80)
    is_active: bool = True


class GrabPriceOut(BaseModel):
    channel: str = "grab"
    base_price: float
    grab_price: float
    markup_percent: float
    pricing_mode: str = "markup"  # markup | override
    price_override: float | None = None
    external_id: str | None = None
    is_published: bool = False


class ServiceOut(ServiceIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    grab: GrabPriceOut | None = None


class GrabPriceIn(BaseModel):
    """Set Grab channel pricing for a menu item."""

    markup_percent: Decimal | None = None
    price_override: Decimal | None = None
    clear_override: bool = False


class WorkspaceUpdateIn(WhatsAppFieldsIn):
    industry: str | None = Field(default=None, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    timezone: str | None = None
    grab_merchant_id: str | None = None
    grab_markup_percent: Decimal | None = None
    grab_partner_token: str | None = None
    clear_grab_partner_token: bool = False
    grab_sync_status: str | None = None


class WhatsAppSetupOut(BaseModel):
    webhook_url: str
    flows_endpoint_url: str
    verify_token: str
    phone_number_id: str | None = None
    display_phone: str | None = None
    business_account_id: str | None = None
    flow_id: str | None = None
    access_token_set: bool = False
    webhook_status: str = "not_configured"
    connected_at: datetime | None = None
    using_platform_fallback: bool = False
    flow_crypto_configured: bool = False
    notes: list[str] = []


class CustomerIn(BaseModel):
    name: str | None = None
    phone: str = Field(min_length=6, max_length=32)
    email: str | None = None
    notes: str | None = None


class CustomerOut(CustomerIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None


class CustomerUpdateIn(BaseModel):
    name: str | None = None
    phone: str | None = Field(default=None, min_length=6, max_length=32)
    email: str | None = None
    notes: str | None = None


class ResourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: str = Field(pattern="^(room|person)$")
    is_active: bool = True
    sort_order: int = 0


class ResourceOut(ResourceIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class BookingIn(BaseModel):
    customer_id: int
    service_id: int | None = None
    room_id: int | None = None
    person_id: int | None = None
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
    room_id: int | None = None
    person_id: int | None = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    service_id: int | None
    room_id: int | None = None
    person_id: int | None = None
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
    room: ResourceOut | None = None
    person: ResourceOut | None = None


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


class PosSaleItemIn(BaseModel):
    service_id: int
    quantity: int = Field(default=1, ge=1, le=99)


class PosSaleIn(BaseModel):
    items: list[PosSaleItemIn] | None = None
    service_id: int | None = None  # legacy single-item
    quantity: int = Field(default=1, ge=1, le=99)
    customer_id: int | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    payment_method: str = Field(pattern="^(cash|qr)$")
    charge_mode: str = Field(default="full", pattern="^(full|deposit)$")
    notes: str | None = None
    starts_at: datetime | None = None


class PosSaleOut(BaseModel):
    booking: BookingOut
    payment_method: str
    amount_due: Decimal
    currency: str
    payment_url: str | None = None
    already_paid: bool = False
    line_items: list[str] = []


class PosReceiptSendIn(BaseModel):
    cash_received: Decimal | None = None
    change: Decimal | None = None
    phone: str | None = None


class PosReceiptSendOut(BaseModel):
    ok: bool = True
    booking_id: int
    sent_to: str
    body: str
    delivered_via: str = "api"  # api | wa_link
    wa_url: str | None = None
    message: str | None = None


class OrderLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_id: int | None = None
    external_item_id: str | None = None
    name: str
    quantity: int
    unit_price: float
    line_total: float
    notes: str | None = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    channel: str
    status: str
    external_order_id: str
    short_order_number: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    currency: str
    subtotal_amount: float
    total_amount: float
    notes: str | None = None
    accepted_at: datetime | None = None
    ready_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    lines: list[OrderLineOut] = Field(default_factory=list)


class OrderStatusUpdateIn(BaseModel):
    status: str = Field(min_length=2, max_length=40)


class GrabPublishOut(BaseModel):
    ok: bool
    dry_run: bool = False
    merchant_id: str | None = None
    item_count: int = 0
    message: str
    sync_status: str


class GrabStatusOut(BaseModel):
    configured: bool
    connected: bool = False
    dry_run_available: bool = True
    partner_merchant_id: str | None = None
    merchant_id: str | None = None
    markup_percent: float = 30
    sync_status: str = "not_configured"
    last_synced_at: datetime | None = None
    activation_url: str | None = None
    partner_token_set: bool = False
    platform_credentials_set: bool = False
    menu_webhook_url: str | None = None
    orders_webhook_url: str | None = None
    sync_state_webhook_url: str | None = None
    notes: list[str] = Field(default_factory=list)


class GrabConnectOut(BaseModel):
    ok: bool
    dry_run: bool = False
    partner_merchant_id: str
    activation_url: str | None = None
    sync_status: str
    message: str


class GrabSimulateOrderIn(BaseModel):
    customer_name: str = "Grab Customer"
    customer_phone: str | None = None
    items: list[dict] = Field(default_factory=list)
    notes: str | None = None
