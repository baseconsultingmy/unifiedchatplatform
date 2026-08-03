# Payments (demo)

After a WhatsApp booking is confirmed, the API attaches a unique pay token and sends:

`https://api.baseapp.asia/pay/{token}`

## Flow

1. Customer confirms booking in WhatsApp
2. Booking saved as `held` + `deposit_due` / `unpaid`
3. Pay link included in the confirmation message
4. Customer opens hosted page and taps **Pay now (demo)**
5. Booking becomes `confirmed` + `deposit_paid` / `paid`
6. WhatsApp receipt is sent; Admin Bookings shows status + link

## Config

| Env | Purpose |
|---|---|
| `PUBLIC_API_BASE` | Base URL used when building pay links (default `https://api.baseapp.asia`) |
| `PAYMENT_MODE` | `demo` now; `hitpay` / `stripe` later |

## Endpoints

- `GET /pay/{token}` — hosted checkout / already-paid page
- `POST /pay/{token}/complete` — mark paid (demo); redirects back to GET

No real money moves in `demo` mode.
