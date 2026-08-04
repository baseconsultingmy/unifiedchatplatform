# BaseApp Unified

WhatsApp + LINE communication and booking platform for SMEs (**Base Kiosk OS**), by **Base Consulting**.

## Brand / CI

Locked corporate identity: [`brand/`](brand/) · [`docs/BRAND.md`](docs/BRAND.md)

| Layer | Name |
|---|---|
| Company | Base Consulting |
| Platform | BaseApp |
| OS wordmark | Base Kiosk OS |

Colors (locked): Navy `#0F2744` · Grey `#475569` · Amber `#E5A100` · Black `#000000`

Admin UX (current): tablet **top-bar** primary tabs (POS / Chat / Bookings) + profile menu — CI is applied on top of that shell.

## Live

| Surface | URL |
|---|---|
| Admin | https://admin.baseapp.asia |
| API | https://api.baseapp.asia/health |
| WhatsApp webhook | https://api.baseapp.asia/v1/webhooks/whatsapp |

## Stack

- `apps/api` — FastAPI booking core + WhatsApp webhook
- `apps/admin` — React Master Admin (Base CI)
- `brand/` — logos, tokens, CI preview
- `deploy/` — Docker Compose + Caddy on DigitalOcean

## Local API (optional)

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# set DATABASE_URL to a local Postgres, then:
uvicorn app.main:app --reload
```

## Deploy

On the droplet (`/opt/baseapp/deploy`):

```bash
docker compose --env-file .env up -d --build
```

See `docs/SERVER.md` and `docs/WHATSAPP.md`.
