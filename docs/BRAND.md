# Base Corporate Identity (Locked)

**Status: LOCKED — August 2026**  
Use this document as the source of truth for all Base Consulting / BaseApp surfaces. Do not invent alternate palettes, fonts, or lockups.

Architecture was reused from Transit; **visual CI is Base Consulting**, not Urge Transit bus livery.

---

## 1. Naming layers

| Layer | Name | Role |
|---|---|---|
| Company | **Base Consulting** | Legal / company identity |
| Product | **BaseApp** | Product identity (admin, marketing, app chrome) |
| OS surface | **Base Kiosk OS** | Counter / kiosk shell wordmark only |
| Region | **ASIA** / **MALAYSIA** / … | Marketing host region (amber pill) |
| Context | **kiosk** / **Master Admin** / page | Product chrome context (amber pill) |

---

## 2. Color system (locked)

| Token | Hex | Role |
|---|---|---|
| Black | `#000000` | Print / mono; amber-pill label on dark grounds |
| Grey | `#475569` | Secondary words: App, Kiosk, Consulting |
| Deep Transit Navy | `#0F2744` | **BASE**, marks, dark grounds |
| Route Amber | `#E5A100` | Arc, dots, **amber pills**, accents only |

CSS: [`brand/tokens.css`](../brand/tokens.css) · Admin mirror: `apps/admin/src/brand/tokens.css`

### DO

- Navy for **BASE**
- Grey for **App** / **Kiosk** / **Consulting**
- Amber for the family arc + amber context/region pills only
- Transparent PNG masters (never flatten onto white for delivery)
- Status green / red only in operational UI

### DON’T

- No teal, rainbow, or flag colors in brand chrome
- No gradients on logos
- No multi-color silhouettes
- No Inter / Roboto / Arial / decorative serif as brand type

---

## 3. Typography (locked)

| Use | Font | Weight |
|---|---|---|
| Brand / wordmark | **Sora** | 800 for BASE · 500 for App |
| Product UI / body | **Manrope** | 400–700 |

---

## 4. Logo hierarchy (locked)

### Company — Base Consulting

`brand/logos/base-consulting-primary.png`  
Family (4) + amber arc + **BASE** + **CONSULTING**

### Product — BaseApp

Shared mark: family (4) + amber arc.

**Canonical product lockup (composable):**

```
[ family mark ]   BASEApp
                  [ amber pill ]
```

- Pill width = **exactly the BaseApp wordmark width** (does not grow with label length)
- Dark grounds: light mark + white BASE + slate App + amber pill with **black** label
- Light grounds: navy mark + navy BASE + grey App + amber pill with **white** label

| Surface | Pill label |
|---|---|
| Admin login | `kiosk` |
| Admin shell | Route / role: Master Admin, POS, Chat, Bookings, … |
| Marketing `baseapp.asia` | `ASIA` |
| Marketing `my.baseapp.asia` | `MALAYSIA` |
| `sg` / `id` / `th` / `ph` / `vn` | SINGAPORE / INDONESIA / THAILAND / PHILIPPINES / VIETNAM |

### Mark only

`brand/logos/base-mark.png` · `base-mark-dark.png` — favicon, compact icon, composable lockups.

### Raster product lockups (optional)

| File | Use |
|---|---|
| `base-app-lockup.png` | Horizontal family \| BaseApp (light, transparent) |
| `base-app-lockup-dark.png` | Same for dark grounds |
| `base-app-primary.png` | Alias of lockup |

Prefer the **composable** `BaseAppBrand` / landing brand markup over flat PNGs when a pill is required.

### OS surface wordmark

```
BASE  |  Kiosk  [OS]
navy     grey    amber badge
```

Files: `base-kiosk-os.svg` / `base-kiosk-os-dark.svg`

---

## 5. Amber pill (locked component)

Route Amber fill · Sora Bold · letter-spacing ~0.06em · radius 0.4rem · width locked to BaseApp.

| Ground | Label color |
|---|---|
| Dark (login, marketing navy) | `#000000` |
| Light (admin top bar) | `#FFFFFF` |

Implementation:

- Admin: `BaseAmberPill` / `BaseAppBrand` in `apps/admin/src/brand/`
- Marketing: `.base-amber-pill` in `deploy/landing/styles.css`

---

## 6. Where CI is applied

| Surface | Location |
|---|---|
| Tokens + masters | `brand/` |
| Admin components | `apps/admin/src/brand/` |
| Admin public assets | `apps/admin/public/brand/` |
| Marketing landing | `deploy/landing/` |
| Rules (this file) | `docs/BRAND.md` |

---

## 7. Change control

This CI is **locked**. Changes require an explicit brand decision and an update to this file + `brand/tokens.css` in the same change set. Do not restyle BaseApp lockups ad hoc in feature work.
