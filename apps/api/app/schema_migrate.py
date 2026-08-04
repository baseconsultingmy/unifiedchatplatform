from sqlalchemy import text

from app.db import engine


def ensure_schema() -> None:
    statements = [
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flow_state VARCHAR(40) DEFAULT 'idle'",
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flow_context TEXT",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_phone_number_id VARCHAR(64)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_access_token TEXT",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_business_account_id VARCHAR(64)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_flow_id VARCHAR(64)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_display_phone VARCHAR(32)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_verify_token VARCHAR(128)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_webhook_status VARCHAR(32) DEFAULT 'not_configured'",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_connected_at TIMESTAMPTZ",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS line_channel_id VARCHAR(64)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_token VARCHAR(64)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_url VARCHAR(500)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_bookings_payment_token ON bookings (payment_token)",
        "ALTER TABLE services ADD COLUMN IF NOT EXISTS category VARCHAR(80)",
        """
        CREATE TABLE IF NOT EXISTS resources (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            name VARCHAR(120) NOT NULL,
            kind VARCHAR(20) NOT NULL DEFAULT 'person',
            is_active BOOLEAN DEFAULT TRUE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_resources_tenant_id ON resources (tenant_id)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES resources(id)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS person_id INTEGER REFERENCES resources(id)",
        "CREATE INDEX IF NOT EXISTS ix_bookings_room_id ON bookings (room_id)",
        "CREATE INDEX IF NOT EXISTS ix_bookings_person_id ON bookings (person_id)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grab_merchant_id VARCHAR(80)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grab_partner_token TEXT",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grab_markup_percent NUMERIC(6,2) DEFAULT 30",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grab_sync_status VARCHAR(40) DEFAULT 'not_configured'",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grab_last_synced_at TIMESTAMPTZ",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grab_activation_url TEXT",
        """
        CREATE TABLE IF NOT EXISTS service_channel_prices (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            service_id INTEGER NOT NULL REFERENCES services(id),
            channel VARCHAR(40) NOT NULL DEFAULT 'grab',
            price_amount NUMERIC(12,2),
            markup_percent NUMERIC(6,2),
            external_id VARCHAR(120),
            is_published BOOLEAN DEFAULT FALSE,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_service_channel_price UNIQUE (service_id, channel)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_service_channel_prices_tenant_id ON service_channel_prices (tenant_id)",
        "CREATE INDEX IF NOT EXISTS ix_service_channel_prices_service_id ON service_channel_prices (service_id)",
        """
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            customer_id INTEGER REFERENCES customers(id),
            channel VARCHAR(40) NOT NULL DEFAULT 'grab',
            status VARCHAR(40) NOT NULL DEFAULT 'new',
            external_order_id VARCHAR(120) NOT NULL,
            short_order_number VARCHAR(40),
            customer_name VARCHAR(120),
            customer_phone VARCHAR(40),
            currency VARCHAR(3) DEFAULT 'MYR',
            subtotal_amount NUMERIC(12,2) DEFAULT 0,
            total_amount NUMERIC(12,2) DEFAULT 0,
            notes TEXT,
            raw_payload TEXT,
            accepted_at TIMESTAMPTZ,
            ready_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_order_external UNIQUE (tenant_id, channel, external_order_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_orders_tenant_id ON orders (tenant_id)",
        """
        CREATE TABLE IF NOT EXISTS order_lines (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            service_id INTEGER REFERENCES services(id),
            external_item_id VARCHAR(120),
            name VARCHAR(160) NOT NULL,
            quantity INTEGER DEFAULT 1,
            unit_price NUMERIC(12,2) DEFAULT 0,
            line_total NUMERIC(12,2) DEFAULT 0,
            notes TEXT
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_order_lines_order_id ON order_lines (order_id)",
        # Best-effort add marketplace channels to legacy Postgres enum.
        """
        DO $$ BEGIN
          ALTER TYPE channel ADD VALUE IF NOT EXISTS 'grab';
        EXCEPTION WHEN others THEN NULL;
        END $$
        """,
        """
        DO $$ BEGIN
          ALTER TYPE channel ADD VALUE IF NOT EXISTS 'foodpanda';
        EXCEPTION WHEN others THEN NULL;
        END $$
        """,
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
