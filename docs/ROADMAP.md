# Build order

1. **Chat (current)** — inbound WhatsApp webhooks + Admin Inbox reply
2. **Booking flow** — WhatsApp interactive menu + services/products in chat
3. **Payments** — deposit/pay links + webhook confirmations

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
- [ ] Slot calendar / availability rules
- [ ] Payment link step
