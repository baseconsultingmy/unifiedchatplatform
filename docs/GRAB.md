# Grab Food POS integration (API v1.1.3)

BaseApp implements the GrabFood partner POS flow per
[GrabFood API v1.1.3](https://developer.grab.com/docs/grabfood/api/v1-1-3/).

1. **Orders in** — submit-order + order-state webhooks, plus optional **Fetch from Grab** (List Orders).
2. **Menu out** — publish notifies Grab; Grab pulls Get Menu (items + modifiers).
3. **Status out** — Accept / Reject / Ready / Cancel call Grab partner APIs.

> **Pricing policy:** Merchant-facing UI never shows Grab vs walk-in price differences,
> markup %, dry-run mode, or per-item Grab overrides. Any internal margin buffer is
> Master Admin–only and must not be disclosed to merchants or Grab.

## Merchant connect flow

1. **Settings → Grab Food → Connect Grab** (or Master Admin → Vendors → Grab)
2. API calls `POST /partner/v1/self-serve/activation` with `partner.merchantID` = tenant slug
3. Merchant opens **activation URL** → Grab Merchant → **Enable Integration**
4. Grab pushes integration status → `POST /v1/webhooks/grab/push-integration-status` (saves real `grabMerchantID`)
5. **Publish menu**
6. Orders arrive under **Orders** (webhook) or tap **Fetch from Grab**

## Credentials

Platform env (from [Grab Developer Portal](https://developer.grab.com/)):

| Env | Purpose |
|---|---|
| `GRAB_CLIENT_ID` | OAuth client id (`food.partner.api`) |
| `GRAB_CLIENT_SECRET` | OAuth client secret |
| `GRAB_PARTNER_WEBHOOK_SECRET` | Shared secret for inbound Grab webhooks |

Per-tenant (merchant-visible):

- `grab_merchant_id` — Grab outlet ID (from integration-status webhook or paste)
- `grab_sync_status` — `not_configured` → `activation_pending` → `ready` → `published` / `synced`

Per-tenant (Master Admin only — never expose in merchant UI/API):

- `grab_markup_percent` — internal margin buffer applied when building Grab menu payloads

Register these partner webhooks with Grab:

| Grab event | Our URL |
|---|---|
| Get menu | `https://api.baseapp.asia/v1/webhooks/grab/merchant/menu` |
| Submit order | `https://api.baseapp.asia/v1/webhooks/grab/orders` |
| Menu sync state | `https://api.baseapp.asia/v1/webhooks/grab/menu/sync-state` |
| Push integration status | `https://api.baseapp.asia/v1/webhooks/grab/push-integration-status` |
| Push order state | `https://api.baseapp.asia/v1/webhooks/grab/order-state` |

## Endpoints

| Method | Path | Who |
|---|---|---|
| `GET` | `/v1/grab/status` | Vendor (no markup fields) |
| `POST` | `/v1/grab/connect` | Vendor — self-serve activation |
| `POST` | `/v1/grab/publish` | Vendor — menu notification |
| `POST` | `/v1/grab/fetch-orders` | Vendor — List Orders sync (prod; not in staging) |
| `POST` | `/v1/grab/simulate-order` | Vendor — local test ticket |
| `GET` / `PATCH` | `/v1/orders` | Vendor queue (+ cancel → Grab) |
| `GET` | `/v1/webhooks/grab/merchant/menu` | Grab pulls menu |
| `POST` | `/v1/webhooks/grab/orders` | Grab submit order |
| `POST` | `/v1/webhooks/grab/menu/sync-state` | Menu sync status |
| `POST` | `/v1/webhooks/grab/push-integration-status` | Store integration status |
| `POST` | `/v1/webhooks/grab/order-state` | Order state updates |

## Publishing menus

1. **Publish to Grab** — BaseApp calls `POST …/merchant/menu/notification`
2. Grab calls **Get menu** webhook — we return categories/items/modifiers

## Fetching orders

- **Automatic:** Grab submit-order + order-state webhooks
- **Manual:** Orders → **Fetch from Grab** → `GET …/partner/v1/orders` (up to 30 days; prod only)

## Demo

- Login: `owner@demo-kitchen.baseapp.asia`
- Slug / merchant id: `demo-kitchen`
