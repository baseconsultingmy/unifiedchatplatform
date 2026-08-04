# BaseApp Corporate Identity

Locked July 2026 · Internal brand use · Adapted from Base Consulting + Base Transit OS pattern.

## Product naming

| Layer | Name | Use |
|---|---|---|
| Company | **Base Consulting** | Legal, footer, print masters |
| Platform | **BaseApp** | Product suite, domain (`baseapp.asia`), admin title |
| OS surface | **Base Kiosk OS** | Counter / kiosk shell wordmark (Transit-pattern) |

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

## Wordmarks

| Asset | File |
|---|---|
| Base Consulting (family + arc) | `brand/logos/base-consulting.svg` |
| Base Consulting mono | `brand/logos/base-consulting-mono.svg` |
| Base Kiosk OS (light) | `brand/logos/base-kiosk-os.svg` |
| Base Kiosk OS (dark) | `brand/logos/base-kiosk-os-dark.svg` |
| BaseApp | `brand/logos/base-app.svg` |
| App icon / favicon mark | `brand/logos/base-mark.svg` |

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
