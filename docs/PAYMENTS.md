# Payments (demo)

After a WhatsApp booking is confirmed, the API attaches a unique pay token and sends:

`https://api.baseapp.asia/pay/{token}`

## Flow

1. Customer confirms booking in WhatsApp
2. Booking saved as `held` + `deposit_due` / `unpaid`
3. Pay link included in the confirmation message
4. Customer opens hosted page and taps **Pay now (demo)**
5. Booking becomes `confirmed` + `deposit_paid` / `paid`
6. Shared receipt template is sent on WhatsApp (same body as POS receipts) and stored in the conversation inbox

Zero-amount bookings skip the pay link and send the receipt immediately on confirm.

## Receipt template

Built by `app/receipts.py` (`format_receipt_text`) and delivered by `app/whatsapp_receipt.py`.
Used by:

- POS → Send to WhatsApp
- WhatsApp / hosted pay → after `POST /pay/{token}/complete`
- Free WhatsApp bookings → on confirm

## Config

| Env | Purpose |
|---|---|
| `PUBLIC_API_BASE` | Base URL used when building pay links (default `https://api.baseapp.asia`) |
| `PAYMENT_MODE` | `demo` now; `hitpay` / `stripe` later |

## Endpoints

- `GET /pay/{token}` — hosted checkout / already-paid page
- `POST /pay/{token}/complete` — mark paid (demo); redirects back to GET

No real money moves in `demo` mode.
