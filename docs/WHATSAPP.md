# WhatsApp Cloud API setup

BaseApp routes one shared webhook to many shops. Each vendor stores its own
**Phone number ID** and (preferably) **access token**. Master Admin configures
these under **Vendors → Meta setup**; merchants can self-serve the same fields
under **Settings → WhatsApp / Meta**.

## Callback URL (all shops)

```text
https://api.baseapp.asia/v1/webhooks/whatsapp
```

## Verify token

1. **Platform default** — `WA_VERIFY_TOKEN` in `deploy/.env` (bootstrap: `baseapp-wa-verify`)
2. **Per-shop override** — optional `wa_verify_token` on the vendor (Master Meta setup or merchant Settings)

Webhook verification accepts either the platform token or any active shop override.

## Master Admin

1. Open **Vendors**
2. Review **Master Meta / WhatsApp** (callback URL, platform verify token, app-secret / fallback status)
3. On each shop → **Meta setup**
4. Paste Phone number ID, permanent System User token, display phone, optional WABA ID / verify override
5. Save — inbound messages for that `phone_number_id` route only to that shop

## Merchant self-serve

1. Sign in as shop owner (or Master Admin → **View as**)
2. Open **Settings**
3. Copy callback URL + verify token into Meta Developer → WhatsApp → Configuration
4. Subscribe to `messages`
5. Paste Phone number ID + permanent access token → **Save WhatsApp settings**

## Server / platform env (still required)

| Variable | Purpose |
|---|---|
| `WA_VERIFY_TOKEN` | Default webhook verify token |
| `WA_APP_SECRET` | Meta app secret for `X-Hub-Signature-256` |
| `META_ACCESS_TOKEN` | Optional platform fallback send token |
| `META_PHONE_NUMBER_ID` | Optional platform fallback phone id |
| `PUBLIC_API_BASE` | Used to build the callback URL shown in admin |

Prefer shop-owned token + phone id. Platform values are fallback only.

## Steps in Meta Developer dashboard

1. Create / open a Meta app with **WhatsApp** product
2. WhatsApp → Configuration → Webhook
3. Callback URL: `https://api.baseapp.asia/v1/webhooks/whatsapp`
4. Verify token: platform default or the shop override you saved
5. Subscribe to `messages`
6. Put the **App Secret** into `WA_APP_SECRET` on the server and recreate the API container
7. Add each shop’s **Phone number ID** + permanent token in admin (or Settings)

## Routing rules

- Inbound payload `metadata.phone_number_id` must match `tenants.wa_phone_number_id`
- Unmapped phone ids return **404** (no silent wrong-shop fallback)
- Outbound sends prefer the shop token/phone id, else platform env

## Booking chatbot (one WhatsApp flow)

Customers book inside a single chat:

1. **Package** — interactive list of active services  
2. **Date** — next 7 days (Today / Tomorrow / weekday)  
3. **Time slot** — available slots 10:00–20:00 shop-local time (skips taken slots; “More times” if needed)  
4. **Confirm** — Confirm / Cancel buttons  
5. **Pay** — hosted pay link; shared receipt after payment  

Type `menu` / `book` to start, `cancel` to reset.

## Policy note

Keep the WABA on legitimate appointment businesses (spa/massage/tattoo studios). Do not mix adult services on the same number.
