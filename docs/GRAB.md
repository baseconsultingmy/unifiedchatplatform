# Grab Food POS integration

BaseApp supports two-way Grab Food integration for F&B tenants:

1. **Orders in** — Grab submit-order webhooks create rows in the vendor **Orders** queue.
2. **Menu out** — vendors publish the shop catalog; Grab pulls the menu after notification.
3. **Smart pricing** — walk-in / dine-in uses `Service.price_amount`; Grab uses override **or** `base × (1 + markup%)` (tenant default 30%, rounded to `.00` / `.50`).

## Credentials

Platform env (optional until partner activation):

| Env | Purpose |
|---|---|
| `GRAB_CLIENT_ID` | OAuth client id |
| `GRAB_CLIENT_SECRET` | OAuth client secret |
| `GRAB_PARTNER_WEBHOOK_SECRET` | Shared secret for inbound Grab webhooks |

Per-tenant (Settings / workspace):

- `grab_merchant_id` — Grab merchant ID (demo kitchen uses `demo-kitchen`)
- `grab_markup_percent` — default Grab markup (e.g. `30`)
- `grab_partner_token` — optional merchant token (write-only)

When platform credentials are missing, publish / accept / ready callbacks run in **dry-run** mode so the panel can be tested end-to-end.

## Endpoints

| Method | Path | Who |
|---|---|---|
| `GET` | `/v1/grab/status` | Vendor |
| `POST` | `/v1/grab/publish` | Vendor — notify Grab + mark items published |
| `POST` | `/v1/grab/simulate-order` | Vendor — local Grab-like order |
| `PATCH` | `/v1/services/{id}/grab-price` | Vendor — override / per-item markup |
| `GET` / `PATCH` | `/v1/orders` | Vendor order queue |
| `GET` | `/v1/webhooks/grab/merchant/menu` | Grab pulls menu |
| `POST` | `/v1/webhooks/grab/orders` | Grab submit order |
| `POST` | `/v1/webhooks/grab/menu/sync-state` | Grab menu sync status |

## Demo

- Login: `owner@demo-kitchen.baseapp.asia` (bootstrap password)
- Slug / merchant id: `demo-kitchen`
- Default Grab markup: **30%** (e.g. Nasi Lemak walk-in RM12 → Grab RM15.50)
- Admin: **Menu** shows walk-in vs Grab price; **Orders** shows the Grab queue; **Simulate Grab order** creates a dry-run ticket.
