# Multi-tenant model

## Roles

| Role | Who | Can do |
|---|---|---|
| `platform_admin` | BaseApp Master Admin | Create/disable vendors, Meta WhatsApp setup per shop, platform totals |
| `owner` | Vendor shop owner | Manage services, bookings, inbox, **Settings → WhatsApp** self-serve |
| `staff` | Vendor staff (later) | Limited vendor workspace access |

## Isolation

- Every service, customer, booking, and conversation has `tenant_id`
- Vendor APIs reject `platform_admin` (they use **Vendors** instead)
- WhatsApp inbound routes by `metadata.phone_number_id` → `tenants.wa_phone_number_id` (required when present)
- Each shop may store its own `wa_access_token`; platform `META_*` env is fallback only

## WhatsApp / Meta credentials

| Field | Set by |
|---|---|
| `wa_phone_number_id` | Master Admin Meta setup **or** merchant Settings |
| `wa_access_token` | Same (write-only; never returned raw) |
| `wa_business_account_id` | Optional |
| `wa_display_phone` | Optional (shown in admin) |
| `wa_verify_token` | Optional override of platform `WA_VERIFY_TOKEN` |
| `wa_webhook_status` | Derived / updated on verify (`not_configured` → `pending`/`configured` → `verified`) |

Shared callback: `https://api.baseapp.asia/v1/webhooks/whatsapp` — see `docs/WHATSAPP.md`.

## Bootstrap accounts

Created on first API boot from `deploy/.env`:

- Master Admin: `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`
- Sample wellness vendor: `owner@demo-studio.baseapp.asia` (same bootstrap password) · industry `health_beauty`
- Sample food vendor: `owner@demo-kitchen.baseapp.asia` (same bootstrap password) · industry `fnb` · Grab merchant `demo-kitchen` (30% markup) — see `docs/GRAB.md`

## View as (Master Admin)

Master Admin can open a vendor workspace without knowing their password:

1. Vendors → **View as**
2. Inspect bookings / services / inbox / Settings as that vendor
3. Click **Exit view as** to restore Master Admin session

API: `POST /v1/vendors/{id}/view-as` returns a short-lived impersonation JWT
(`impersonator_id` + `impersonating` claims).
