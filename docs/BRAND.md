# BaseApp Corporate Identity

Locked July 2026 · Internal brand use · Adapted from Base Consulting + Base Transit OS pattern.

## Product naming

| Layer | Name | Use |
|---|---|---|
| Company | **Base Consulting** | Company logo (family + arc + BASE + CONSULTING) |
| Product | **BaseApp** | Product logo (family + arc + BaseApp) — login, product chrome |
| OS surface | **Base Kiosk OS** | Counter shell wordmark (Transit-pattern: BASE \| Kiosk \[OS\]) |

Architecture was reused from Transit; **visual CI is Base Consulting**, not Urge Transit bus livery.

## Locked color system

| Token | Hex | Role |
|---|---|---|
| Black | `#000000` | Primary text (print), monochrome logos |
| Grey | `#475569` | Secondary text, “Kiosk” / “Consulting” / “App” |
| Deep Transit Navy | `#0F2744` | “BASE”, icons, dark grounds |
| Route Amber | `#E5A100` | Accents, OS badge, Consulting arc / dots |

CSS source of truth: [`brand/tokens.css`](../brand/tokens.css)

### DO

- Navy for the word **BASE**
- Grey for secondary words (**Kiosk**, **App**, **Consulting**)
- Amber only for accents and the **OS** badge
- Keep black master files for print
- Status UIs may use green / red sparingly

### DON’T

- No teal, gold rainbows, or flag colors
- No gradients on logos
- No multi-color silhouettes

## Logos

| Asset | File | Use |
|---|---|---|
| **Company** — Base Consulting | `brand/logos/base-consulting-primary.png` | Company lockup (includes CONSULTING) |
| **Product** — BaseApp | `brand/logos/base-app-primary.png` | Product logo: family + arc + BaseApp |
| **Mark** (family + arc only) | `brand/logos/base-mark.png` | Favicon, top-bar icon |
| Base Kiosk OS | `brand/logos/base-kiosk-os.svg` | OS surface wordmark (light) |
| Base Kiosk OS dark | `brand/logos/base-kiosk-os-dark.svg` | OS surface wordmark (dark) |

Product logo uses the same family + amber arc as the company logo, with **BaseApp** under it (no CONSULTING).

### Base Kiosk OS pattern (from Transit OS)

```
BASE  |  Kiosk  [OS]
navy     grey    amber badge + white/black label
```

On dark shells: white **BASE**, slate **Kiosk**, amber badge with black **os**.

## Typography

- **Brand / wordmark:** Sora (heavy for BASE, medium for secondary)
- **Product UI:** Manrope
- Do not use Inter, Roboto, Arial-as-brand, or decorative serifs for product chrome

## Admin application

Admin UX note: product chrome uses the tablet **top-bar** (POS / Chat / Bookings + profile menu). CI tokens and wordmarks apply to that shell — do not reintroduce a permanent left sidebar without an intentional UX change.
