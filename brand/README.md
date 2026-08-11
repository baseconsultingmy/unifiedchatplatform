# Base CI assets (locked August 2026)

**Source of truth for usage rules:** [`docs/BRAND.md`](../docs/BRAND.md)

## Contents

| Path | Purpose |
|---|---|
| `tokens.css` | Locked color + type tokens |
| `logos/` | Masters (PNG lockups + SVG wordmarks) |
| `preview.html` | Visual board — open locally in a browser |

## Logo masters

| File | Role |
|---|---|
| `base-consulting-primary.png` | **Company** — family + arc + BASE + CONSULTING |
| `base-mark.png` / `base-mark-dark.png` | Shared family + arc mark |
| `base-app-lockup.png` / `base-app-lockup-dark.png` | Product horizontal lockup (no pill) |
| `base-app-primary.png` / `base-app-primary-dark.png` | Aliases of lockup |
| `base-kiosk-os.svg` (+ dark) | OS surface wordmark |

## Canonical product chrome

Composable lockup (preferred when a pill is needed):

```
[mark]  BASEApp
        [amber pill]   ← width = BaseApp wordmark
```

- Admin: `BaseAppBrand` (`apps/admin/src/brand/`)
- Marketing: `deploy/landing/` (region pill: ASIA / MALAYSIA / …)

Do not introduce new brand colors, fonts, or alternate lockups outside this package.
