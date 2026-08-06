# LINE Messaging API

BaseApp connects each vendor shop to a **LINE Official Account** Messaging API channel so chats appear in **Chat** alongside WhatsApp.

Docs: [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/overview/)

## Setup (per shop)

1. Create a LINE Official Account → enable **Messaging API** in [LINE Developers](https://developers.line.biz/)
2. Copy:
   - **Channel ID**
   - **Channel secret**
   - **Channel access token** (long-lived)
3. In BaseApp → **Settings → LINE Messaging**, paste the three values → Save
4. In LINE Developers → Messaging API → Webhook:
   - URL: `https://api.baseapp.asia/v1/webhooks/line`
   - Enable **Use webhook**
   - Verify → should return 200

## How it works

| Direction | Path |
|---|---|
| Inbound | LINE → `POST /v1/webhooks/line` (HMAC `X-Line-Signature`) → Conversation / Message |
| Outbound | Admin Chat → `POST /v1/conversations/{id}/messages` → LINE push API |

Multi-tenant routing uses webhook `destination` (= Channel ID) mapped to `tenants.line_channel_id`.

## API

| Method | Path | Who |
|---|---|---|
| `GET` | `/v1/line/status` | Vendor |
| `PATCH` | `/v1/line/settings` | Vendor |
| `POST` | `/v1/webhooks/line` | LINE Platform |

## Fields (`tenants`)

- `line_channel_id`
- `line_channel_secret` (write-only in UI)
- `line_channel_access_token` (write-only in UI)
- `line_webhook_status` — `not_configured` → `configured` → `verified`
- `line_connected_at`
