# FinanceOS Lite

Aplicación personal para consolidar, revisar y clasificar movimientos financieros con ayuda de agentes. Esta versión "Lite" del proyecto FinanceOS reemplaza el stack original Next.js + Prisma + PostgreSQL por un stack más liviano y portable: **FastAPI + SQLite + Vite + React**, ideal para correr en local con Docker o Forger.

La idea del proyecto sigue siendo la misma: no es un SaaS multiusuario, es una herramienta para una sola persona, con base de datos privada y flujo operado por su dueño.

## Stack

- **Backend**: Python 3.12 · FastAPI · SQLModel · SQLite · `uv`
- **Frontend**: TypeScript · React 18 · Vite · MUI (Material UI) · `@mui/x-data-grid` · `@mui/x-charts`
- **Empaquetado**: Docker Compose (opcional)

## Estructura

```
finance-os-lite/
  backend/                  Python API + scripts CLI
    app/                    FastAPI app, modelos, rutas y servicios
    scripts/                Init DB, seed, import CSV, edit, verify
    data/                   SQLite (generado en tiempo de ejecución)
    pyproject.toml
    Dockerfile
  frontend/                 SPA Vite + React
    src/
      api/                  Capa HTTP que consume al backend
      components/           Componentes UI (Dashboard, Movimientos, etc.)
      lib/                  Helpers de formato y derivaciones
      i18n/                 Textos en español
      theme/                Tema MUI dark
    package.json
    Dockerfile
  skills/load-movements/    Skill para que agentes carguen movimientos
  docker-compose.yml
  manifest.json
```

## Requisitos

Una de las dos opciones:

- **Docker** (recomendado): solo necesitas Docker y Docker Compose.
- **Local**: Python 3.12+ con `uv`, y Node.js 20+ con npm.

## Cómo empezar (Docker)

1. Clona este repositorio.
2. Levanta los servicios:

   ```bash
   docker compose up --build
   ```

3. Crea las tablas y carga las categorías por defecto en otra terminal:

   ```bash
   docker compose exec backend uv run python scripts/init_db.py
   docker compose exec backend uv run python scripts/seed.py
   ```

4. Listo:
   - Frontend: http://localhost:5180
   - API: http://localhost:8000 (Swagger UI en `/docs`)

La base de datos vive en `./backend/data/finance_os.sqlite` y persiste entre reinicios.

## Cómo empezar (local sin Docker)

### Backend

```bash
cd backend
uv sync                # crea .venv e instala deps
uv run python scripts/init_db.py
uv run python scripts/seed.py
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5180.

## Variables de entorno

| Variable             | Defecto                                              | Dónde      |
| -------------------- | ---------------------------------------------------- | ---------- |
| `DATABASE_URL`       | `sqlite:///<repo>/backend/data/finance_os.sqlite`    | backend    |
| `CORS_ORIGINS`       | `http://localhost:5180,http://127.0.0.1:5180`        | backend    |
| `VITE_API_BASE_URL`  | `http://localhost:8000`                              | frontend   |

## Scripts CLI (backend)

Todos corren con `uv` desde `backend/`:

```bash
uv run python scripts/init_db.py
uv run python scripts/seed.py
uv run python scripts/list_categories.py
uv run python scripts/list_movements.py --limit 50
uv run python scripts/edit_movement.py --id <movement_id> [--reviewed true]
uv run python scripts/delete_movement.py --id <movement_id>
uv run python scripts/upsert_categories.py path/to/categories.json
uv run python scripts/import_movements.py path/to/movements.csv
uv run python scripts/verify.py
```

Cuando uses Docker, anteponé `docker compose exec backend ` a cada uno.

## Importación de movimientos

El importador acepta el mismo CSV canónico que la versión Next.js original. Columnas reconocidas (con alias en español):

- `date` / `fecha` (obligatorio)
- `amount` / `monto` (obligatorio)
- `business` / `comercio` (obligatorio)
- `reason` / `descripcion` / `detalle` / `glosa` (obligatorio)
- `subcategory` / `subcategoria` (obligatorio)
- `source` / `fuente` (opcional, default `MANUAL`; valores: `BANK`, `CREDIT_CARD`, `MANUAL`)
- `accountingDate` / `fecha contable` (opcional, default = `date`)
- `raw_description` / `descripcionoriginal` (opcional)
- `reviewed` / `revisado` (opcional, default `false`)

La deduplicación se basa en fecha raw + monto + comercio + razón + fuente + raw description, igual que la versión original.

## Modelo mental de datos

- `date`: fecha raw/original del movimiento. Se usa para detectar duplicados al importar.
- `accountingDate`: fecha contable. Define dónde cae el movimiento en el dashboard mensual.

## Verificación

```bash
# Backend
cd backend && uv run python scripts/verify.py

# Frontend
cd frontend && npm run verify
```

`verify.py` corre `ruff`, `pyright` y un smoke test sobre el endpoint `/health`. `npm run verify` corre `eslint` y `tsc --noEmit`.

## Uso con agentes

El proyecto está pensado para ser operado con apoyo de agentes (Claude, Codex, etc.). El flujo ideal es:

1. El humano entrega un documento fuente (imagen, PDF, captura, estado de cuenta).
2. El agente interpreta el material y lo normaliza a CSV canónico.
3. El agente usa la skill `skills/load-movements` para cargar el CSV con `scripts/import_movements.py`.
4. El humano revisa la clasificación y la `accountingDate` desde la UI.

## Alcance

- Herramienta personal.
- Un único operador.
- Base de datos privada.
- Sin hardening de producto, ni objetivos de escala, ni autenticación.
