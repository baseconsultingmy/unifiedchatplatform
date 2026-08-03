# Build order

1. **Chat** — inbound WhatsApp webhooks + Admin Inbox reply
2. **Booking flow** — WhatsApp interactive menu + services/products in chat
3. **Payments (current)** — deposit/pay links + demo checkout confirmations

## Chat status

- [x] Inbound WhatsApp → vendor inbox
- [x] Outbound reply from Admin via Cloud API
- [x] Thread refresh / polling
- [ ] Media messages / templates outside 24h window
- [ ] Agent assignment / handoff states

## Booking flow status

- [x] WhatsApp service list from vendor catalog
- [x] Pick service → preferred time → confirm buttons
- [x] Creates Admin booking (`held`, deposit_due/unpaid)
- [x] Payment link step (sent on confirm)
- [ ] Slot calendar / availability rules

## Payments status

- [x] Booking deposit/payment fields + unique pay token
- [x] Hosted demo checkout at `/pay/{token}`
- [x] WhatsApp confirm includes pay link; receipt after pay
- [x] Admin Bookings shows payment status + pay link
- [x] Admin calendar + booking detail actions
- [x] Walk-in POS (cash + QR pay panel)
- [x] Pay status polling for counter QR (`/pay/{token}/status`)
- [x] Assignable rooms / artists (resources) on bookings
- [ ] HitPay / Stripe / DuitNow QR live providers (`PAYMENT_MODE`)
- [ ] Partial payments / balance due after deposit
- [ ] Conflict detection / availability by resource
- [ ] Staff login linked to person resources
- [ ] Staff schedules / multi-resource calendar columns
