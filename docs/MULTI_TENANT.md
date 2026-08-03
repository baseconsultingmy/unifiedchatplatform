# Multi-tenant model

## Roles

| Role | Who | Can do |
|---|---|---|
| `platform_admin` | BaseApp Master Admin | Create/disable vendors, see platform totals |
| `owner` | Vendor shop owner | Manage that vendor's services, bookings, inbox |
| `staff` | Vendor staff (later) | Limited vendor workspace access |

## Isolation

- Every service, customer, booking, and conversation has `tenant_id`
- Vendor APIs reject `platform_admin` (they use **Vendors** instead)
- WhatsApp inbound routes by `metadata.phone_number_id` → `tenants.wa_phone_number_id` when set

## Bootstrap accounts

Created on first API boot from `deploy/.env`:

- Master Admin: `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`
- Sample vendor owner: `owner@demo-studio.baseapp.asia` (same bootstrap password)
