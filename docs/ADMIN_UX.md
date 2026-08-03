# Cross-industry admin UX

BaseApp adapts labels and POS behaviour by **business type** (`tenants.industry`):

| Industry | Catalog | POS feel | Deposits / duration |
|---|---|---|---|
| `health_beauty` | Services | Treatments + add-ons | Yes |
| `fnb` | Menu | Kiosk ticket + quantities | No |
| `retail` | Products | Qty cart | No |
| `general` | Catalog | Generic ticket | Optional |

## POS layout

1. **Catalog** — category chips + item tiles (tap to add)
2. **Ticket** — line items with qty − / +
3. **Checkout** — customer panel, compact cash keypad, cash / QR

## Customer panel

- Walk-in quick action
- Search existing customers by name/phone
- Edit name / phone / note for the ticket

## Catalog categories

Each catalog item can have a free-text `category` (e.g. Treatments, Drinks, Food). POS chips filter on these.

Set business type under **Services / Menu / Products → Business type**.
