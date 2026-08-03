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

In Exabytes DNS for `baseapp.asia`, set A records to `157.245.149.238`:

| Host | Type | Value |
|---|---|---|
| `@` | A | `157.245.149.238` |
| `www` | A | `157.245.149.238` |
| `api` | A | `157.245.149.238` |
| `admin` | A | `157.245.149.238` |

After DNS propagates, uncomment the host blocks in `deploy/Caddyfile` and reload Caddy for automatic HTTPS.

## Deploy / reload edge proxy

```bash
ssh root@157.245.149.238
cd /opt/baseapp
docker compose pull
docker compose up -d
docker compose logs -f caddy
```

## Access for Cursor agents

Add this public key to `/root/.ssh/authorized_keys` on the droplet:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMoW/9ifAr1oU5QxhLVAAmfFTK9XifyvGwW9WVyW99wO cursor-cloud-agent-baseapp
```
