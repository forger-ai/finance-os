# BOOTSTRAP

Esta guía explica cómo comenzar `FinanceOS Lite` desde cero.

Si eres un agente y el usuario todavía no ha instalado nada, guíalo usando este documento.

## 1. Elegir cómo correrlo

Hay dos formas:

- **Docker Compose** (recomendado): solo necesitas Docker.
- **Local**: Python 3.12+ con [`uv`](https://docs.astral.sh/uv/) y Node.js 20+ con npm.

A continuación se muestran ambos.

## 2. Levantar con Docker

```bash
docker compose up --build
```

Esto inicia:

- `backend`: FastAPI en `http://localhost:8000` (con Swagger UI en `/docs`).
- `frontend`: Vite + React en `http://localhost:5180`.

La base de datos SQLite vive en `./backend/data/finance_os.sqlite` y persiste en disco.

## 3. Crear estructura de base de datos

Aplicar el esquema y dejar la base lista:

```bash
docker compose exec backend uv run python scripts/init_db.py
```

> Si lo prefieres, este paso también se ejecuta automáticamente en el primer arranque de la API gracias al hook `on_startup`. El script explícito solo lo necesitas si quieres preparar el archivo antes.

## 4. Cargar categorías por defecto

El proyecto trae categorías y subcategorías iniciales en el seed:

```bash
docker compose exec backend uv run python scripts/seed.py
```

Para mostrarlas:

```bash
docker compose exec backend uv run python scripts/list_categories.py
```

## 5. Preguntar si las categorías por defecto sirven

Después de mostrar las categorías iniciales, el agente debería preguntarle al usuario si quiere partir con esa base.

Si al usuario le gustan, puede seguir con el flujo normal.

## 6. Si no le gustan, personalizarlas

Hay dos opciones:

### Opción A — UI

Que el usuario las cree y edite manualmente desde la pantalla **Configuración** del frontend.

### Opción B — Script

Que el agente las cree por él. Para eso existe este script:

```bash
docker compose exec backend uv run python scripts/upsert_categories.py /app/scripts/data/categories.json
```

El archivo debe ser un JSON con este formato:

```json
[
  {
    "name": "Esencial fijo",
    "kind": "EXPENSE",
    "budget": "900000",
    "subcategories": ["Arriendo", "Luz", "Internet"]
  },
  {
    "name": "Income",
    "kind": "INCOME",
    "budget": null,
    "subcategories": ["Sueldo", "Bono"]
  }
]
```

Notas:

- `kind` debe ser `INCOME`, `EXPENSE` o `UNCHARGEABLE`.
- `budget` puede ser string, number o `null`.
- El script hace upsert: crea o actualiza categorías y subcategorías.

## 7. Verificación recomendada al comenzar

Para validar que todo está bien conectado:

```bash
docker compose exec backend uv run python scripts/verify.py
docker compose exec frontend npm run verify
```

Esto corre `ruff` + `pyright` + smoke test del backend, y `eslint` + `tsc --noEmit` del frontend.

## 8. Levantar localmente sin Docker

### Backend

```bash
cd backend
uv sync
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

Abre `http://localhost:5180`.

## 9. Flujo operativo después del bootstrap

Cuando el proyecto ya está listo:

1. El humano entrega cualquier fuente que el agente pueda interpretar.
2. El agente extrae la información.
3. El agente la normaliza a CSV (formato canónico definido en `skills/load-movements/SKILL.md`).
4. El agente usa la skill basada en CSV para cargar movimientos:
   ```bash
   docker compose exec backend uv run python scripts/import_movements.py /app/scripts/data/<archivo>.csv
   ```
5. El humano revisa movimientos, clasificación y `accountingDate` en la UI.
