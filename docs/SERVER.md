# BaseApp server notes

## Production droplet (DigitalOcean)

| Item | Value |
|---|---|
| Name | `Base-App-Unified` |
| Region | `SGP1` (Singapore) |
| OS | Ubuntu 24.04 LTS |
| Public IPv4 | `157.245.149.238` |
| App dir | `/opt/baseapp` |

## Installed baseline

- System updates + unattended upgrades
- UFW firewall: allow `22`, `80`, `443`
- fail2ban
- Docker Engine + Compose plugin
- Caddy reverse-proxy placeholder (`deploy/`)

## DNS (Exabytes → DigitalOcean)

In Exabytes DNS Manager for `baseapp.asia`, target A records:

| Host | Type | Value | Status |
|---|---|---|---|
| `@` | A | `157.245.149.238` | Live + HTTPS |
| `www` | CNAME → `baseapp.asia` | (via apex) | Live + HTTPS |
| `api` | A | `157.245.149.238` | Live + HTTPS cert issued |
| `admin` | A | `157.245.149.238` | Live + HTTPS cert issued |

Smoke checks:

- https://baseapp.asia
- https://www.baseapp.asia
- https://api.baseapp.asia
- https://admin.baseapp.asia


## Deploy / reload edge proxy

```bash
ssh root@157.245.149.238
cd /opt/baseapp
docker compose pull
docker compose up -d
docker compose logs -f caddy
```

## App deploy path

```text
/opt/baseapp/
  apps/api
  apps/admin
  deploy/docker-compose.yml
  deploy/Caddyfile
  deploy/.env          # secrets — chmod 600
```

Rebuild / restart:

```bash
cd /opt/baseapp/deploy
docker compose --env-file .env up -d --build
```

Bootstrap admin credentials live in `deploy/.env` (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`). Change after first login.

## Access for Cursor agents

Add this public key to `/root/.ssh/authorized_keys` on the droplet:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMoW/9ifAr1oU5QxhLVAAmfFTK9XifyvGwW9WVyW99wO cursor-cloud-agent-baseapp
```

