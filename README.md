# BaseApp Unified

WhatsApp + LINE communication and booking platform for SMEs (health & wellness, appointments, payments), with a Master Admin panel.

## Status

- DigitalOcean droplet baseline ready (`docs/SERVER.md`)
- App services not implemented yet

## Repo layout

- `deploy/` — Caddy + Docker Compose edge proxy
- `docs/` — ops notes

## Quick check

After DNS points to the droplet:

```bash
curl -I http://157.245.149.238
```
