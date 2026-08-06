# LINE Messaging API

BaseApp connects each vendor shop to a **LINE Official Account** Messaging API channel so chats appear in **Chat** alongside WhatsApp. Customers can book via:

1. **Text bot** — numbered menus in chat (`menu` → package → date → time → confirm)
2. **LIFF mini-app** — tap-through booking UI inside LINE (optional)

Docs: [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/overview/) · [LIFF](https://developers.line.biz/en/docs/liff/overview/)

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
5. Turn **off** auto-reply / greeting messages in LINE Official Account Manager if they fight the booking bot (optional but recommended)

## Text booking bot

After webhook is verified, message the OA:

| Customer types | What happens |
|---|---|
| `hi` / `hello` / `menu` / `book` / follow OA | Package list (reply with a number) |
| `1` … `10` | Choose package → date → time → confirm |
| `1` on confirm | Holds slot + Pay button |
| `cancel` / `0` | Reset |
| `app` / `liff` / `web` | Opens LIFF (if configured) or signed web booking link |

Bookings show in Admin → Bookings / Chat with channel **LINE**.

## LIFF mini-app (optional)

1. LINE Developers → your Messaging API channel → **LIFF** → Add
2. Endpoint URL: `https://api.baseapp.asia/liff/{shop-slug}`  
   Example for demo studio: `https://api.baseapp.asia/liff/demo-studio`
3. Size: Full · Scopes: `profile` · open in LINE
4. Copy **LIFF ID** into BaseApp → Settings → LINE → **LIFF ID** → Save
5. In chat, customers can type `app`, or you can add a Rich Menu button with URI `https://liff.line.me/{LIFF_ID}`

The LIFF page uses the LINE login token to identify the customer, then reuses the same catalog / reserve APIs as the web book sheet.

Without a LIFF ID, the bot still offers a signed mobile web link:  
`/book/{slug}?line=…&sig=…`

## How it works

| Direction | Path |
|---|---|
| Inbound | LINE → `POST /v1/webhooks/line` (HMAC `X-Line-Signature`) → Conversation / Message → booking flow reply |
| Outbound | Admin Chat → `POST /v1/conversations/{id}/messages` → LINE push API |
| LIFF | `GET /liff/{slug}` → LIFF SDK → `POST /liff/{slug}/session` → `POST /book/{slug}/reserve` |

Multi-tenant routing uses webhook `destination` (= Channel ID) mapped to `tenants.line_channel_id`.

## API

| Method | Path | Who |
|---|---|---|
| `GET` | `/v1/line/status` | Vendor |
| `PATCH` | `/v1/line/settings` | Vendor |
| `POST` | `/v1/webhooks/line` | LINE Platform |
| `GET` | `/liff/{slug}` | LIFF / customer |
| `POST` | `/liff/{slug}/session` | LIFF client |
| `GET` | `/book/{slug}?line=&sig=` | Customer (web fallback) |

## Fields (`tenants`)

- `line_channel_id`
- `line_channel_secret` (write-only in UI)
- `line_channel_access_token` (write-only in UI)
- `line_liff_id` (optional)
- `line_webhook_status` — `not_configured` → `configured` → `verified`
- `line_connected_at`

Platform default LIFF ID can also be set via env `LINE_LIFF_ID` (tenants override).

## Notes

- LINE user IDs are stored on `customers.phone` (VARCHAR 64) for that tenant — same pattern as WhatsApp phone keys.
- LINE has no WhatsApp Flows equivalent; use the text bot + LIFF instead.
