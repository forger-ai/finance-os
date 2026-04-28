---
name: stack-database-extension
description: Use when changing Finance OS database models, schema initialization, migrations, Docker Compose mounts, or scripts that depend on app.database. Preserve the vite-fastapi-sqlite stack pattern: commons owns the shared database helper; Finance OS owns model registration and app-specific migrations through database_ext.
---

# Stack Database Extension

This skill is for the agent, not for the end user.

Use it when working on Finance OS backend database behavior, SQLModel tables,
SQLite migrations, Docker Compose helper mounts, or internal scripts that call
database initialization.

## Stack Contract

Finance OS uses the `vite-fastapi-sqlite` stack.

The shared stack database helper lives in:

```text
commons/backend/database.py
```

In Docker Compose, that helper is mounted over:

```text
/app/app/database.py
```

That mount is intentional. Do not remove it as the normal fix for app-specific
schema behavior.

The shared helper owns:

- `DATABASE_URL` resolution;
- the shared SQLModel `engine`;
- SQLite foreign-key pragma setup;
- `get_session()`;
- generic `init_db()` based on `SQLModel.metadata.create_all()`.

Finance OS owns:

- SQLModel table declarations in `backend/app/models.py`;
- model registration in `backend/app/database_ext.py`;
- app-specific migrations in `backend/app/database_ext.py`;
- startup sequencing in `backend/app/main.py`;
- internal scripts that need Finance OS initialization.

## Required Pattern

When Finance OS needs schema behavior beyond `create_all()`, keep the shared
`app.database` helper mounted from commons and add app-specific behavior in:

```text
backend/app/database_ext.py
```

Expose an app-level initializer from that file, for example:

```python
def init_app_db() -> None:
    run_app_specific_migrations()
    init_db()
```

Application startup should import and call that app-level initializer:

```python
from app.database import engine
from app.database_ext import init_app_db


@app.on_event("startup")
def _startup() -> None:
    init_app_db()
```

Internal scripts should call the same app-level initializer when they need a
ready Finance OS database:

```python
from app.database import engine
from app.database_ext import init_app_db as init_db
```

This keeps script behavior aligned with the running app.

## Migration Rules

Use `backend/app/database_ext.py` for migrations that depend on Finance OS
models, tables, categories, movements, settings, or data semantics.

Do not put Finance OS-specific migrations in `commons/backend/database.py`.
Commons must stay reusable across apps in the stack.

Do not remove the `commons/backend/database.py` bind mount from
`docker-compose.yml` just to make an app-specific migration run. If the mount
blocks the migration, the migration is in the wrong place for this stack
contract.

Use idempotent migrations:

- detect the current schema first;
- return immediately when the schema already matches;
- preserve existing user data;
- run data-moving changes inside transactions where SQLite permits it;
- call the shared `init_db()` after app-specific migration steps so any missing
tables are created from registered SQLModel metadata.

For SQLite table rebuild migrations:

- read legacy rows first;
- derive any new required fields from existing related tables when possible;
- drop or rename the legacy table only after data is captured;
- recreate the table through SQLModel metadata or explicit SQL;
- insert preserved rows with the new shape;
- verify the resulting columns and row count.

## Verification

After changing database initialization or migrations, verify all relevant
entrypoints:

```bash
docker compose up -d --build backend
curl -sS -i http://localhost:8000/api/categories
curl -sS -i http://localhost:8000/api/movements
docker compose exec -T backend uv run python scripts/list_categories.py
```

When changing a migration, also test against a temporary legacy SQLite database
that reproduces the old schema. Confirm that:

- new columns exist;
- existing rows remain present;
- derived foreign keys are correct;
- startup remains idempotent when run twice.

These commands are internal agent tools. Do not present them as normal user
instructions unless the user explicitly asks for technical details.
