from sqlalchemy import text

from app.db import engine


def ensure_schema() -> None:
    statements = [
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flow_state VARCHAR(40) DEFAULT 'idle'",
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flow_context TEXT",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform BOOLEAN DEFAULT FALSE",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_phone_number_id VARCHAR(64)",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS line_channel_id VARCHAR(64)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_token VARCHAR(64)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_url VARCHAR(500)",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_bookings_payment_token ON bookings (payment_token)",
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
