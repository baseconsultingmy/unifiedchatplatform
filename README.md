# BaseApp Unified

WhatsApp + LINE communication and booking platform for SMEs, with a Master Admin for reservations, payments, and inbox.

## Live

| Surface | URL |
|---|---|
| Admin | https://admin.baseapp.asia |
| API | https://api.baseapp.asia/health |
| WhatsApp webhook | https://api.baseapp.asia/v1/webhooks/whatsapp |

## Stack

- `apps/api` — FastAPI booking core + WhatsApp webhook
- `apps/admin` — React Master Admin
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
