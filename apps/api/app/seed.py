from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, OrderLine, OrderStatus, Resource, Service, Tenant, User, UserRole
from app.security import hash_password


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned or "vendor"


def bootstrap(db: Session) -> None:
    platform = db.query(Tenant).filter(Tenant.slug == "baseapp-platform").first()
    if platform is None:
        platform = Tenant(
            name="BaseApp Platform",
            slug="baseapp-platform",
            industry="platform",
            timezone="Asia/Kuala_Lumpur",
            country="MY",
            is_platform=True,
        )
        db.add(platform)
        db.flush()

    platform_admin = db.query(User).filter(User.email == settings.bootstrap_admin_email).first()
    if platform_admin is None:
        db.add(
            User(
                tenant_id=platform.id,
                email=settings.bootstrap_admin_email,
                full_name="BaseApp Master Admin",
                password_hash=hash_password(settings.bootstrap_admin_password),
                role=UserRole.platform_admin.value,
            )
        )
    else:
        platform_admin.tenant_id = platform.id
        platform_admin.role = UserRole.platform_admin.value
        platform_admin.full_name = platform_admin.full_name or "BaseApp Master Admin"

    # Sample vendor so Master Admin can see a shop immediately.
    vendor = db.query(Tenant).filter(Tenant.slug == "demo-studio").first()
    if vendor is None:
        vendor = Tenant(
            name=settings.bootstrap_tenant_name,
            slug="demo-studio",
            industry="health_beauty",
            timezone="Asia/Kuala_Lumpur",
            country="MY",
            is_platform=False,
        )
        db.add(vendor)
        db.flush()
    elif vendor.industry in {"wellness", "beauty", "spa"}:
        vendor.industry = "health_beauty"

    vendor_owner_email = "owner@demo-studio.baseapp.asia"
    vendor_owner = db.query(User).filter(User.email == vendor_owner_email).first()
    if vendor_owner is None:
        db.add(
            User(
                tenant_id=vendor.id,
                email=vendor_owner_email,
                full_name="Demo Studio Owner",
                password_hash=hash_password(settings.bootstrap_admin_password),
                role=UserRole.owner.value,
            )
        )

    if db.query(Service).filter(Service.tenant_id == vendor.id).count() == 0:
        db.add_all(
            [
                Service(
                    tenant_id=vendor.id,
                    name="Signature Massage 60m",
                    description="Relaxation massage for first-time guests.",
                    duration_minutes=60,
                    price_amount=120,
                    deposit_amount=30,
                    currency="MYR",
                    category="Treatments",
                ),
                Service(
                    tenant_id=vendor.id,
                    name="Deep Tissue 90m",
                    description="Therapeutic deep tissue session.",
                    duration_minutes=90,
                    price_amount=180,
                    deposit_amount=50,
                    currency="MYR",
                    category="Treatments",
                ),
                Service(
                    tenant_id=vendor.id,
                    name="Small Tattoo Session",
                    description="Up to 2 hours flash / small custom work.",
                    duration_minutes=120,
                    price_amount=250,
                    deposit_amount=80,
                    currency="MYR",
                    category="Tattoo",
                ),
            ]
        )
    else:
        # Backfill categories for demo catalog when missing.
        for svc in db.query(Service).filter(Service.tenant_id == vendor.id, Service.category.is_(None)):
            lowered = (svc.name or "").lower()
            if "tattoo" in lowered:
                svc.category = "Tattoo"
            elif "massage" in lowered or "tissue" in lowered:
                svc.category = "Treatments"
            else:
                svc.category = "General"

    if db.query(Resource).filter(Resource.tenant_id == vendor.id).count() == 0:
        db.add_all(
            [
                Resource(tenant_id=vendor.id, name="Room 1", kind="room", sort_order=1),
                Resource(tenant_id=vendor.id, name="Room 2", kind="room", sort_order=2),
                Resource(tenant_id=vendor.id, name="Tattoo Bay A", kind="room", sort_order=3),
                Resource(tenant_id=vendor.id, name="Aisha", kind="person", sort_order=1),
                Resource(tenant_id=vendor.id, name="Wei", kind="person", sort_order=2),
                Resource(tenant_id=vendor.id, name="Rafi", kind="person", sort_order=3),
            ]
        )

    # Optional: attach platform Meta phone id to demo shop when unset (dev convenience).
    if settings.meta_phone_number_id and not (vendor.wa_phone_number_id or "").strip():
        vendor.wa_phone_number_id = settings.meta_phone_number_id.strip()
    from app.whatsapp_creds import refresh_whatsapp_status

    refresh_whatsapp_status(vendor)

    # Sample F&B vendor for kiosk / menu POS testing (no rooms/staff).
    kitchen = db.query(Tenant).filter(Tenant.slug == "demo-kitchen").first()
    if kitchen is None:
        kitchen = Tenant(
            name="BaseApp Demo Kitchen",
            slug="demo-kitchen",
            industry="fnb",
            timezone="Asia/Kuala_Lumpur",
            country="MY",
            is_platform=False,
        )
        db.add(kitchen)
        db.flush()
    else:
        kitchen.industry = "fnb"

    kitchen.grab_markup_percent = kitchen.grab_markup_percent or 30
    if not (kitchen.grab_merchant_id or "").strip():
        kitchen.grab_merchant_id = "demo-kitchen"
    if kitchen.grab_sync_status in (None, "", "not_configured"):
        kitchen.grab_sync_status = "ready"

    kitchen_owner_email = "owner@demo-kitchen.baseapp.asia"
    kitchen_owner = db.query(User).filter(User.email == kitchen_owner_email).first()
    if kitchen_owner is None:
        db.add(
            User(
                tenant_id=kitchen.id,
                email=kitchen_owner_email,
                full_name="Demo Kitchen Owner",
                password_hash=hash_password(settings.bootstrap_admin_password),
                role=UserRole.owner.value,
            )
        )
    else:
        kitchen_owner.tenant_id = kitchen.id
        kitchen_owner.role = UserRole.owner.value

    if db.query(Service).filter(Service.tenant_id == kitchen.id).count() == 0:
        db.add_all(
            [
                Service(
                    tenant_id=kitchen.id,
                    name="Nasi Lemak",
                    description="Coconut rice with sambal, egg, and peanuts.",
                    duration_minutes=15,
                    price_amount=12,
                    deposit_amount=0,
                    currency="MYR",
                    category="Food",
                ),
                Service(
                    tenant_id=kitchen.id,
                    name="Chicken Rice",
                    description="Hainanese chicken rice set.",
                    duration_minutes=15,
                    price_amount=14,
                    deposit_amount=0,
                    currency="MYR",
                    category="Food",
                ),
                Service(
                    tenant_id=kitchen.id,
                    name="Roti Canai (2pcs)",
                    description="Crispy flatbread with dhal.",
                    duration_minutes=10,
                    price_amount=5,
                    deposit_amount=0,
                    currency="MYR",
                    category="Food",
                ),
                Service(
                    tenant_id=kitchen.id,
                    name="Iced Teh Tarik",
                    description="Pulled milk tea over ice.",
                    duration_minutes=5,
                    price_amount=4.5,
                    deposit_amount=0,
                    currency="MYR",
                    category="Drinks",
                ),
                Service(
                    tenant_id=kitchen.id,
                    name="Kopi O",
                    description="Black coffee, local style.",
                    duration_minutes=5,
                    price_amount=3.5,
                    deposit_amount=0,
                    currency="MYR",
                    category="Drinks",
                ),
                Service(
                    tenant_id=kitchen.id,
                    name="Combo Set A",
                    description="Nasi Lemak + Iced Teh Tarik.",
                    duration_minutes=15,
                    price_amount=15,
                    deposit_amount=0,
                    currency="MYR",
                    category="Combos",
                ),
            ]
        )

    # Sample Grab order so Orders queue is non-empty for demos.
    if db.query(Order).filter(Order.tenant_id == kitchen.id).count() == 0:
        menu_items = (
            db.query(Service)
            .filter(Service.tenant_id == kitchen.id, Service.is_active.is_(True))
            .order_by(Service.id.asc())
            .limit(2)
            .all()
        )
        if menu_items:
            from decimal import Decimal

            from app.pricing import compute_channel_price

            sample = Order(
                tenant_id=kitchen.id,
                channel="grab",
                status=OrderStatus.new.value,
                external_order_id="SIM-DEMO-KITCHEN-001",
                short_order_number="G-101",
                customer_name="Aisha (Grab)",
                customer_phone="+60123456789",
                currency="MYR",
                notes="Demo Grab Food order",
            )
            db.add(sample)
            db.flush()
            subtotal = Decimal("0")
            for svc in menu_items:
                unit = compute_channel_price(
                    base_price=svc.price_amount,
                    tenant=kitchen,
                    channel_price=None,
                    channel="grab",
                )
                qty = 1
                line_total = unit * qty
                subtotal += line_total
                db.add(
                    OrderLine(
                        order_id=sample.id,
                        service_id=svc.id,
                        external_item_id=f"svc-{svc.id}",
                        name=svc.name,
                        quantity=qty,
                        unit_price=float(unit),
                        line_total=float(line_total),
                    )
                )
            sample.subtotal_amount = float(subtotal)
            sample.total_amount = float(subtotal)

    db.commit()
