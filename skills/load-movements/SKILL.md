---
name: finance-import
description: Use when importing finance movements into this repo from CSV files, or when categorizing imported rows using the local database categories and subcategories. Prefer the repo scripts under backend/scripts and the working directory under backend/scripts/data/.
---

# Finance Import

Use this skill when loading movements into the local FinanceOS Lite database.

## Workflow

1. Create or place the source CSV inside `backend/scripts/data/`.
2. Read `skills/load-movements/MEMORY.md` before categorizing rows to reuse prior decisions.
3. Infer categories and subcategories as far as possible from merchant name, reason, and prior memory.
4. Convert the file into the canonical CSV format expected by `scripts/import_movements.py`.
5. Import with the repo script.
6. Delete the CSV from `backend/scripts/data/` only after a successful import, unless the user explicitly asks to keep it.

## Canonical CSV

Expected columns:

- `date`
- `amount`
- `business`
- `reason`
- `source`
- `raw_description`
- `subcategory`
- `reviewed`

Accepted aliases in the importer include Spanish names such as `fecha`, `monto`, `comercio`, `descripcion`, `detalle`, `glosa`, `subcategoria`, and `revisado`.

## Repo Scripts

All scripts run from `backend/`:

- `uv run python scripts/import_movements.py <csv_path>`
- `uv run python scripts/list_categories.py`
- `uv run python scripts/list_movements.py --limit 50`
- `uv run python scripts/edit_movement.py --id <movement_id> [fields...]`
- `uv run python scripts/delete_movement.py --id <movement_id>`

If you are using Docker, prepend `docker compose exec backend ` to each command, and reference paths as `/app/scripts/data/<file>.csv`.

The HTTP equivalent is `POST /api/imports/movements-csv` (multipart upload, field name `file`). Useful when you need to drive the import from the browser or another agent without shell access.

When there is ambiguity:

- prefer inference backed by `skills/load-movements/MEMORY.md`
- otherwise choose the narrowest plausible subcategory
- if confidence is low, surface the uncertain rows clearly before importing
