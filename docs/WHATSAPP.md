# WhatsApp Cloud API setup

BaseApp routes one shared webhook to many shops. Each vendor stores its own
**Phone number ID** and (preferably) **access token**. Master Admin configures
these under **Vendors → Meta setup**; merchants can self-serve the same fields
under **Settings → WhatsApp / Meta**.

## Callback URL (all shops)

```text
https://api.baseapp.asia/v1/webhooks/whatsapp
```

## Flows data endpoint (in-chat booking)

```text
https://api.baseapp.asia/v1/webhooks/whatsapp/flows
```

Booking happens inside WhatsApp via **WhatsApp Flows** (native multi-screen form),
not a browser sheet. Meta encrypts Flow data-exchange traffic to this endpoint.

## Verify token

1. **Platform default** — `WA_VERIFY_TOKEN` in `deploy/.env` (bootstrap: `baseapp-wa-verify`)
2. **Per-shop override** — optional `wa_verify_token` on the vendor (Master Meta setup or merchant Settings)

Webhook verification accepts either the platform token or any active shop override.

## Master Admin

1. Open **Vendors**
2. Review **Master Meta / WhatsApp** (callback URL, Flows endpoint, platform verify token, crypto status)
3. On each shop → **Meta setup**
4. Paste Phone number ID, permanent System User token, display phone, **WABA ID**
5. Save, then click **Publish booking Flow** (uploads Flow JSON, sets endpoint, publishes, saves `wa_flow_id`)
6. Inbound messages for that `phone_number_id` route only to that shop

## Merchant self-serve

1. Sign in as shop owner (or Master Admin → **View as**)
2. Open **Settings**
3. Copy callback URL + verify token into Meta Developer → WhatsApp → Configuration
4. Subscribe to `messages`
5. Paste Phone number ID + permanent access token (+ WABA ID) → **Save WhatsApp settings**
6. Ask Master Admin to **Publish booking Flow** if Flow ID is still empty

## Server / platform env (still required)

| Variable | Purpose |
|---|---|
| `WA_VERIFY_TOKEN` | Default webhook verify token |
| `WA_APP_SECRET` | Meta app secret for `X-Hub-Signature-256` |
| `META_ACCESS_TOKEN` | Optional platform fallback send token |
| `META_PHONE_NUMBER_ID` | Optional platform fallback phone id |
| `PUBLIC_API_BASE` | Used to build callback / Flows / pay URLs |
| `WA_FLOW_PRIVATE_KEY` | RSA private key PEM (or base64 PEM) for Flows decrypt |
| `WA_FLOW_PRIVATE_KEY_PASSWORD` | Passphrase if the private key is encrypted |
| `WA_FLOW_PUBLIC_KEY` | Matching public key PEM (uploaded to phone number on Publish) |
| `WA_FLOW_DRAFT_MODE` | `true` to send draft Flows before publish succeeds |

Prefer shop-owned token + phone id. Platform values are fallback only.

## Steps in Meta Developer dashboard

1. Create / open a Meta app with **WhatsApp** product
2. WhatsApp → Configuration → Webhook
3. Callback URL: `https://api.baseapp.asia/v1/webhooks/whatsapp`
4. Verify token: platform default or the shop override you saved
5. Subscribe to `messages`
6. Put the **App Secret** into `WA_APP_SECRET` on the server and recreate the API container
7. Add each shop’s **Phone number ID** + permanent token + **WABA ID** in admin
8. Master Admin → **Publish booking Flow** (registers encryption public key + Flow)

## Routing rules

- Inbound payload `metadata.phone_number_id` must match `tenants.wa_phone_number_id`
- Unmapped phone ids return **404** (no silent wrong-shop fallback)
- Outbound sends prefer the shop token/phone id, else platform env
- Flows data-exchange resolves the shop from the encrypted `flow_token` (tenant_id + phone)

## Booking (native WhatsApp Flow)

Customers type `menu` / `book` and get **one WhatsApp message** with a **Book**
button that opens an in-chat Flow:

1. Package  
2. Date — only dates that still have open slots  
3. Time — only available times (taken/past slots are never listed)  
4. Confirm  

On confirm, BaseApp holds the slot and sends a **Pay now** CTA (payment page only —
selection stays inside WhatsApp).

Legacy hosted sheet at `/book/{slug}` remains for backwards compatibility but is
not the primary chat path.

## Policy note

Keep the WABA on legitimate appointment businesses (spa/massage/tattoo studios). Do not mix adult services on the same number.
