# Cross-industry admin UX

BaseApp adapts labels and POS behaviour by **business type** (`tenants.industry`):

| Industry | Catalog | POS feel | Resources (room/staff) | Deposits / duration |
|---|---|---|---|---|
| `health_beauty` | Services | Treatments + add-ons | Rooms + artists/therapists | Yes |
| `fnb` | Menu | Kiosk cart + quantities | Hidden | No |
| `retail` | Products | Qty cart | Hidden | No |
| `general` | Catalog | Generic cart | Optional | Optional |

## POS layout

1. **Catalog** (left) — category chips + item tiles (tap to add)
2. **Customer** (middle) — walk-in, search existing, name/phone/note
3. **Cart / register** (right) — item summary with qty, total, cash keypad, cash / QR

## Bookings assignment (Health & Beauty)

Resources are assignable capacity — not login accounts:

- **Room / bay** — treatment room, tattoo bay, chair
- **Person** — massage therapist, tattoo artist, stylist

Manage under **Rooms & staff**. On Bookings:

- Create booking with optional room + person
- Re-assign from booking detail
- Calendar filter by person; events show assignment

## Catalog categories

Each catalog item can have a free-text `category` (e.g. Treatments, Drinks, Food). POS chips filter on these.

Set business type under **Services / Menu / Products → Business type**.
