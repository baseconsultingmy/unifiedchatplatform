# Marketing landing (baseapp.asia)

Static site served by edge Caddy from `/srv/landing`.

## Brand lockup

```
[family mark]  BASEApp
               [REGION]   ← amber pill, width locked to BaseApp
```

| Host | Pill |
|---|---|
| `baseapp.asia` / `www` | ASIA |
| `my.baseapp.asia` | MALAYSIA |
| `sg.baseapp.asia` | SINGAPORE |
| `id.baseapp.asia` | INDONESIA |
| `th.baseapp.asia` | THAILAND |
| `ph.baseapp.asia` | PHILIPPINES |
| `vn.baseapp.asia` | VIETNAM |

Override for local preview: `?region=my`

## Deploy

Synced with the rest of `/opt/baseapp` via rsync. Caddy mounts `./landing` → `/srv/landing`.
Reload after Caddyfile changes:

```bash
cd /opt/baseapp/deploy && docker compose --env-file .env up -d caddy
```
