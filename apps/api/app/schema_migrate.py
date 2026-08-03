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
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
