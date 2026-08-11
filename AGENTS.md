# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout caveat (important)
- The `main` branch currently contains **only `README.md`**. All application code lives on
  feature branches (`cursor/*`), each of which contains `apps/api`, `apps/admin`, `deploy/`, etc.
- To run or develop the product you must be on a feature branch that has `apps/api` and
  `apps/admin`. On `main` there is nothing to run.

### Services
- `apps/api` — FastAPI backend (Python 3.12), served with `uvicorn` on port `8000`.
- `apps/admin` — React 19 + Vite frontend, dev server on port `5173`.
- PostgreSQL 16 — the only datastore. The API auto-creates the schema and seeds bootstrap
  data on startup (FastAPI lifespan runs `create_all` + `ensure_schema()` + `bootstrap()`),
  so there is **no separate migration step**.

### PostgreSQL (non-obvious)
- Postgres is installed in the VM image but is **not** auto-started (no systemd). Start it with:
  `sudo pg_ctlcluster 16 main start`
- A `baseapp` role and `baseapp` database (password `baseapp`) already exist in the cluster.
- The API's default `DATABASE_URL` points at host `db` (the Docker Compose service name).
  For local dev you **must** override it to localhost:
  `export DATABASE_URL=postgresql+psycopg2://baseapp:baseapp@localhost:5432/baseapp`

### Running the backend (`apps/api`)
```
cd apps/api
. .venv/bin/activate
export DATABASE_URL=postgresql+psycopg2://baseapp:baseapp@localhost:5432/baseapp
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Health check: `GET http://localhost:8000/health`.
- Bootstrap master-admin login (seeded): `admin@baseapp.asia` / `ChangeMeNow123`.

### Running the frontend (`apps/admin`)
```
cd apps/admin
export VITE_API_BASE=http://localhost:8000   # defaults to the production API otherwise
npm run dev -- --host 0.0.0.0 --port 5173
```

### Lint / test / build
- Lint (frontend): `cd apps/admin && npm run lint` (oxlint; currently emits warnings only).
- Build (frontend): `cd apps/admin && npm run build` (`tsc -b && vite build`).
- There is **no automated test suite** in this repo (no pytest/vitest), and no backend linter configured.

### External integrations
- WhatsApp/Meta, LINE, Grab Food, Google Identity, Cloudflare, Exabytes and payments are all
  optional. Without credentials they run in demo/dry-run mode and do not block core
  booking/POS/vendor flows. Payment mode defaults to `demo`.
