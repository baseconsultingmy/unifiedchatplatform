# Deploy sync note

Never delete `deploy/.env` on the server.

A backup is kept at `/root/baseapp.env`.

When syncing from a workstation:

```bash
rsync -az --delete \
  --exclude .env \
  --exclude node_modules \
  --exclude dist \
  ./apps ./deploy ./docs ./README.md ./.gitignore \
  root@157.245.149.238:/opt/baseapp/
```
