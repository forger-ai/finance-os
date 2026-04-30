# Finance OS Lite

Personal application for consolidating, reviewing, and classifying financial movements with agent assistance. This Lite version of Finance OS replaces the original Next.js + Prisma + PostgreSQL stack with a lighter and more portable stack: **FastAPI + SQLite + Vite + React**, suited for local use with Docker or Forger.

The project idea is the same: it is not a multi-user SaaS. It is a tool for one person, with a private database and a flow operated by its owner.

## Stack

- **Backend**: Python 3.12 · FastAPI · SQLModel · SQLite · `uv`
- **Frontend**: TypeScript · React 18 · Vite · MUI (Material UI) · `@mui/x-data-grid` · `@mui/x-charts`
- **Packaging**: Docker Compose (optional)

## Structure

```text
finance-os-lite/
  backend/                  Python API + CLI scripts
    app/                    FastAPI app, models, routes, and services
    scripts/                Init DB, import CSV, edit, verify
    data/                   SQLite, generated at runtime
    pyproject.toml
    Dockerfile
  frontend/                 Vite + React SPA
    src/
      api/                  HTTP layer that consumes the backend
      components/           UI components (Dashboard, Movements, etc.)
      lib/                  Formatting and derived-data helpers
      i18n/                 Spanish UI copy
      theme/                MUI dark theme
    package.json
    Dockerfile
  skills/load-movements/    Skill for agents to load movements
  docker-compose.yml
  manifest.json
```

## Requirements

Use one of these options:

- **Docker** (recommended): Docker and Docker Compose.
- **Local**: Python 3.12+ with `uv`, and Node.js 20+ with npm.

## Getting Started (Docker)

1. Clone this repository.
2. Start the services:

   ```bash
   docker compose up --build
   ```

3. Prepare the local database in another terminal:

   ```bash
   docker compose exec backend uv run python scripts/init_db.py
   ```

4. Done:
   - Frontend: http://localhost:5180
   - API: http://localhost:8000 (Swagger UI at `/docs`)

The database lives in `./backend/data/finance_os.sqlite` and persists between restarts.

## Getting Started (Local without Docker)

### Backend

```bash
cd backend
uv sync
uv run python scripts/init_db.py
uv run fastapi dev src/app/main.py --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5180.

## Environment Variables

| Variable             | Default                                              | Where      |
| -------------------- | ---------------------------------------------------- | ---------- |
| `DATABASE_URL`       | `sqlite:///<repo>/backend/data/finance_os.sqlite`    | backend    |
| `CORS_ORIGINS`       | `http://localhost:5180,http://127.0.0.1:5180`        | backend    |
| `VITE_API_BASE_URL`  | `http://localhost:8000`                              | frontend   |

## Backend CLI Scripts

All commands run with `uv` from `backend/`:

```bash
uv run python scripts/init_db.py
uv run python scripts/list_categories.py
uv run python scripts/list_movements.py --limit 50
uv run python scripts/edit_movement.py --id <movement_id> [--reviewed true]
uv run python scripts/delete_movement.py --id <movement_id>
uv run python scripts/upsert_categories.py path/to/categories.json
uv run python scripts/import_movements.py path/to/movements.csv
uv run python scripts/verify.py
```

When using Docker, prefix each command with `docker compose exec backend `.

## Movement Import

The importer accepts the same canonical CSV as the original Next.js version. Recognized columns, including Spanish aliases:

- `date` / `fecha` (required)
- `amount` / `monto` (required)
- `business` / `comercio` (required)
- `reason` / `descripcion` / `detalle` / `glosa` (required)
- `subcategory` / `subcategoria` (required)
- `source` / `fuente` (optional, default `MANUAL`; values: `BANK`, `CREDIT_CARD`, `MANUAL`)
- `accountingDate` / `fecha contable` (optional, default = `date`)
- `raw_description` / `descripcionoriginal` (optional)
- `reviewed` / `revisado` (optional, default `false`)

Deduplication is based on raw date + amount + merchant + reason + source + raw description, matching the original version.

## Data Mental Model

- `date`: raw/original movement date. Used to detect duplicates during import.
- `accountingDate`: accounting date. Defines where the movement lands in the monthly dashboard.

## Verification

```bash
# Backend
cd backend && uv run python scripts/verify.py

# Frontend
cd frontend && npm run verify
```

`verify.py` runs `ruff`, `pyright`, and a smoke test against the `/health` endpoint. `npm run verify` runs `eslint` and `tsc --noEmit`.

## Catalog Publication

Publication uses **GitHub Release** and not a direct push to `main`:

1. Merge to `main` with green CI.
2. Create a tag/release using the format `finance-os/vX.Y.Z`.
3. The `Release App` workflow:
   - verifies/builds backend and frontend,
   - generates `finance-os-X.Y.Z.zip`,
   - uploads the ZIP to the release,
   - opens an automatic PR in `forger-ai/apps-catalog` to update the catalog `manifest.json`.

Required secret in this repo:

- `APPS_CATALOG_TOKEN`: PAT with `contents` and `pull_requests` permissions for `forger-ai/apps-catalog`.

## Agent Use

The project is designed to be operated with agent support (Claude, Codex, etc.). The ideal flow is:

1. The human provides a source document (image, PDF, screenshot, account statement).
2. The agent interprets the material and normalizes it to canonical CSV.
3. The agent uses the `skills/load-movements` skill to load the CSV with `scripts/import_movements.py`.
4. The human reviews classification and `accountingDate` from the UI.

## Scope

- Personal tool.
- Single operator.
- Private database.
- No product hardening, scale objectives, or authentication.
