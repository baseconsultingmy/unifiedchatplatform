# Cross-industry admin UX

BaseApp adapts labels and POS behaviour by **business type** (`tenants.industry`):

| Industry | Catalog | POS feel | Deposits / duration |
|---|---|---|---|
| `health_beauty` | Services | Treatments + add-ons | Yes |
| `fnb` | Menu | Kiosk cart + quantities | No |
| `retail` | Products | Qty cart | No |
| `general` | Catalog | Generic cart | Optional |

## POS layout

1. **Catalog** (left) — category chips + item tiles (tap to add)
2. **Customer** (middle) — walk-in, search existing, name/phone/note
3. **Cart / register** (right) — item summary with qty, total, cash keypad, cash / QR

## Catalog categories

Each catalog item can have a free-text `category` (e.g. Treatments, Drinks, Food). POS chips filter on these.

Set business type under **Services / Menu / Products → Business type**.
