---
name: finance-import
description: "Use when the user wants to load, normalize, classify, review, or correct finance movements in Finance OS. This is an internal agent skill: translate user-facing requests into safe data operations without exposing paths, scripts, temporary CSVs, or commands unless the user explicitly asks for technical details."
---

# Finance Import

This skill is for the agent, not for the end user.

Use it when the user wants to load movements, classify transactions, review imported rows, deduplicate data, or correct movement data in the local Finance OS database.

The user should experience this as:

- sharing a file or pasting movement data;
- asking Finance OS to load or review it;
- receiving a clear summary of what was imported, skipped, failed, or needs review.

The user should not be asked to:

- place files in `backend/scripts/data`;
- create a canonical CSV manually;
- run `uv`, Python scripts, Docker commands, or shell commands;
- understand database tables, internal IDs, or project paths;
- choose between CLI and HTTP import paths.

## Source of Truth

Before using this skill, read the app-level `AGENTS.md`.

That file defines the visible product capabilities, internal tools, communication rules, safety constraints, and limits of Finance OS.

If this skill and `AGENTS.md` appear to conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"Finance OS can load financial movements from data the user shares, then help review and classify those movements."

Valid user-facing wording:

- "Compárteme el archivo o pega los movimientos y los reviso para cargarlos."
- "Voy a cargar los movimientos que pueda interpretar y te diré cuáles quedaron con problemas."
- "Después de cargar, puedo ayudarte a revisar clasificaciones dudosas."

Avoid user-facing wording like:

- "Pon el CSV en `backend/scripts/data`."
- "Tengo que convertirlo a CSV canónico."
- "Voy a correr `scripts/import_movements.py`."
- "Necesito que uses esta ruta del repo."

Only mention those details if the user explicitly asks how the import works internally.

## Internal Workflow

1. Understand the source.
2. Identify columns, dates, amounts, merchants, descriptions, source type, and existing classification hints.
3. Read `skills/load-movements/MEMORY.md` before categorizing rows.
4. Review existing categories/subcategories before assigning classifications.
5. Normalize the data into the canonical importer shape.
6. Use the local import path, script, or HTTP endpoint that is safest for the current environment.
7. Review the import result.
8. Report the outcome in user-facing language.

For PDF statements with selectable text, use the backend dependency `pypdf`
from inside `backend/` before falling back to visual-only interpretation. If
`pypdf` returns no usable text or rows, explain that the document does not expose
structured movement data confidently enough to import without inventing rows.

## Internal Working Files

If a temporary file is needed, create it inside an internal working location that the app/agent can access.

The established repo convention is `backend/scripts/data/`.

This path is internal. Do not tell the user to use it.

Delete temporary files after a successful import unless:

- the user explicitly asks to keep the generated file;
- the file is needed for troubleshooting;
- the import failed and keeping it helps diagnose the problem.

When retaining a temporary file for debugging, do not expose the path unless the user asks for technical details.

## Canonical Movement Shape

The importer expects movement data with these concepts:

- `date`: original/raw transaction date.
- `accountingDate`: accounting date, when available. If absent, it usually defaults to `date`.
- `amount`: positive amount magnitude. Do not encode financial direction in the sign; direction comes from the selected category's `kind`.
- `business`: merchant, counterparty, or business name.
- `reason`: description, reason, memo, detail, or glosa.
- `source`: `BANK`, `CREDIT_CARD`, or `MANUAL`.
- `raw_description`: original unmodified source description when available.
- `subcategory`: target subcategory.
- `reviewed`: whether the movement is already confirmed by the user.

Classification invariant: if a movement has a subcategory, that subcategory must
belong to the same category stored on the movement. Do not create or preserve
category/subcategory mismatches.

Accepted aliases include Spanish names such as:

- `fecha`
- `monto`
- `comercio`
- `descripcion`
- `detalle`
- `glosa`
- `subcategoria`
- `revisado`

Do not force the user to know these column names. They are for internal normalization.

## Classification Rules

Use `skills/load-movements/MEMORY.md` to reuse prior classification decisions.

Prefer existing categories and subcategories when possible.

If the source contains a category that does not exist, decide whether to:

- map it to an existing subcategory;
- ask the user for the intended category;
- create/update categories through internal tools if the user asked for that outcome.

If confidence is low:

- do not silently import as if certain;
- surface the uncertain rows in simple language;
- ask for confirmation when the classification would affect many rows.

Useful user-facing wording:

- "Hay algunas filas donde no estoy seguro de la categoría. Te las muestro antes de cargarlas."
- "Puedo cargarlas como pendientes de revisión para que las confirmes después."
- "Estas categorías no existen todavía. ¿Quieres que las cree o prefieres usar categorías actuales?"

## Internal Tools

All commands below are internal agent tools.

Do not present them as user instructions.

### Import movements

Run from `backend/`:

```bash
uv run python scripts/import_movements.py <csv_path>
```

Docker equivalent:

```bash
docker compose exec backend uv run python scripts/import_movements.py /app/scripts/data/<file>.csv
```

Use when:

- the normalized file is ready;
- categories/subcategories are known enough;
- the user asked to load data;
- destructive changes are not involved.

### List categories

Run from `backend/`:

```bash
uv run python scripts/list_categories.py
```

Use before classification, category creation, or import decisions.

### List movements

Run from `backend/`:

```bash
uv run python scripts/list_movements.py --limit 50
```

Use to inspect current data, confirm imports, detect duplicates, or answer user questions.

### Edit movement

Run from `backend/`:

```bash
uv run python scripts/edit_movement.py --id <movement_id> [fields...]
```

Use for targeted corrections.

Confirm before batch edits when the criterion is not obvious.

### Delete movement

Run from `backend/`:

```bash
uv run python scripts/delete_movement.py --id <movement_id>
```

This is destructive.

Use only after explicit functional confirmation from the user, especially for duplicates or bulk cleanup.

### HTTP import endpoint

Endpoint:

```text
POST /api/imports/movements-csv
```

Multipart field:

```text
file
```

Use when driving the running app through HTTP is safer or more appropriate than shell access.

This endpoint is still an internal tool from the perspective of normal user communication.

## Import Result Handling

After importing, summarize:

- how many rows were inserted;
- how many failed;
- why rows failed, in plain language;
- whether any rows need review;
- whether classification choices were inferred;
- what the user can review next in Finance OS.

Good response:

"Cargué 42 movimientos. 39 entraron correctamente y 3 necesitan revisión porque no traían fecha válida. Dejé las clasificaciones dudosas como pendientes para que las revisemos."

Bad response:

"El script devolvió failed=3 y el CSV está en backend/scripts/data."

## Safety Rules

- Never hide failed rows.
- Never claim import success if the tool returned failures.
- Do not delete source or generated files before checking the result.
- Do not perform destructive cleanup without confirmation.
- Do not create many new categories without a clear user goal.
- Preserve raw descriptions when available.
- Keep accounting date and original date distinct.
- If a row looks duplicated, call that out instead of blindly importing.

## When To Ask The User

Ask when:

- source data is unreadable or ambiguous;
- many rows have uncertain categories;
- the user wants a bulk edit with unclear criteria;
- deleting or overwriting data is involved;
- categories/subcategories need structural changes;
- the import could create misleading financial data.

Ask in functional terms:

- "¿Quieres que estas filas queden como pendientes de revisión?"
- "¿Prefieres crear una categoría nueva o usar una existente?"
- "¿Confirmas que estos movimientos son duplicados y puedo eliminarlos?"

Do not ask:

- "¿Dónde guardo el CSV?"
- "¿Quieres que corra este comando?"
- "¿Qué ruta del repo uso?"

## Technical Explanation Mode

If the user explicitly asks how the import works internally, then you may explain:

- temporary CSV normalization;
- canonical columns;
- importer script;
- HTTP endpoint;
- database validation;
- duplicate detection strategy;
- where temporary files may live.

Even then, separate technical details from normal usage:

"Normalmente no tienes que hacer esto; Forger lo usa por dentro cuando cargas movimientos."
