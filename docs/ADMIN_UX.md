# Admin UX — Bookings, POS, QR

## Bookings

- **Calendar** week view (Mon–Sun, 08:00–22:00) for the vendor workspace
- **List** view for full history
- Booking detail actions: mark paid, show QR pay, complete, cancel
- `GET /v1/bookings?from=&to=` filters by `starts_at` for the calendar range
- Create booking auto-fills `ends_at` from service duration

## Walk-in POS

- Nav: **POS**
- Pick a service, charge **full** or **deposit**
- **Cash paid** — records booking as paid immediately
- **Show QR pay** — creates sale + on-screen QR for the customer’s phone
- API: `POST /v1/pos/sale`

## QR payments

- QR encodes the existing hosted checkout URL: `/pay/{token}`
- Counter polls `GET /pay/{token}/status` until `paid` / `deposit_paid`
- Demo checkout only for now; HitPay / DuitNow QR can replace later via `PAYMENT_MODE`
