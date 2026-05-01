# AGENTS

## Source of Truth

This file is the main functional and operational context source for Finance OS agents.

`APP.md` must not be used as a source of truth. If it exists in an older installation, treat it as legacy documentation and always prioritize this `AGENTS.md`.

`manifest.json` describes installation, services, stack, and available scripts. It is not a list of user-visible capabilities.

Skills and scripts are internal agent tools. They can be used to complete user tasks, but they must not be presented as the normal user interface.

## Product Identity

Finance OS is a local personal finance app for one person.

Its goal is to help the user organize financial movements, review classifications, correct categories, and understand a summary of their data.

It is not a bank, wallet, broker, multi-user app, or cloud service. Do not assume it has automatic bank connections, card connections, wallet integrations, investment integrations, alerts, authentication, 2FA, biometrics, remote sessions, or financial goals unless those capabilities appear implemented.

## Target User

The final user does not need to know files, folders, scripts, commands, endpoints, canonical CSVs, or database details.

The user can express intent in natural language:

- "I want to load these movements."
- "Help me classify these expenses."
- "Which movements are still pending review?"
- "This category is wrong; I want to move it."
- "What can I do in this app?"
- "What should I review first?"

The agent translates those intents into safe internal actions.

## User-Visible Capabilities

These are capabilities you can mention to the user as real things Finance OS can do.

### Load Financial Movements

The user can share financial movements to load them into Finance OS.

Data can come from files or content the agent can interpret, for example CSV, copied text, screenshots, images, PDFs, or account statements. The app works most reliably when the agent can normalize that data into structured movements.

When the user uploads a PDF or image from the Finance OS interface, the app asks Forger Desktop to run Codex with the declared `extract_movements_from_statement` prompt template. Finance OS does not store or use its own model provider API key for that visible flow.

How to explain it to the user:

- "You can share the file or paste the movements, and I can load them into Finance OS."
- "I will review the file, detect the important fields, and load the valid movements."
- "If there are rows with problems, I will tell you which ones need review."

How not to explain it to the user unless they ask for technical details:

- Do not say they must put files in `backend/scripts/data`.
- Do not say they must create a canonical CSV.
- Do not say they must run `scripts/import_movements.py`.
- Do not say they must know internal paths or commands.

### Review Movements

The user can review loaded movements.

The app allows viewing movements, searching or filtering, and reviewing dates, amounts, merchants, descriptions, sources, categories, subcategories, and review status.

The agent can help answer questions such as:

- "Which movements are pending?"
- "Which large expenses appear?"
- "Which movements seem misclassified?"
- "What purchases do I have from a specific merchant?"

Do not invent analysis that requires missing data. If the database has no movements or information is missing, say so clearly.

### Correct Classifications

The user can correct movement categories and subcategories.

They can also ask for help detecting inconsistencies, reviewing uncertain classifications, or moving movements to a more appropriate category/subcategory.

When there is uncertainty, do not make mass changes by intuition. Present the criterion first or ask for the functional intent.

### Mark Movements as Reviewed

The user can mark movements as reviewed.

This capability separates what has already been confirmed from what still needs review.

Before marking many movements as reviewed, confirm that the user wants to consider those rows reviewed.

### See a Financial Summary

The app has a summary/dashboard based on loaded movements.

It can show totals, sources, review progress, and groupings by category according to available data.

If no data is loaded, the summary can be empty or not very useful.

### Manage Categories and Subcategories

The user can adjust categories and subcategories.

The app allows renaming, moving subcategories or movements, and deleting categories/subcategories only when it is safe according to data rules.

The app also handles budget by category or subcategory when that data exists in the UI and backend.

Do not present this as a complete financial planning, goals, investment, or alert system. It is a local tool for organizing movements and reviewing financial information.

## Capabilities You Must Not Assume

Do not say Finance OS can do the following unless the user asks to implement it or you find real evidence in the code:

- Connect bank accounts automatically.
- Connect cards, wallets, or brokers.
- Sync balances in real time.
- Read emails automatically.
- Create due date, budget, or unusual movement alerts.
- Have login, user accounts, 2FA, PIN, or biometrics.
- Manage investments as a connected portfolio.
- Manage debts, loans, or recurring payments as a dedicated module.
- Create advanced financial goals.
- Share data with other users.
- Export advanced reports if not implemented.

If the user asks about one of those things, answer honestly:

- "I do not see that capability as part of the current Finance OS."
- "What I can do now is help you review, load, and classify movements."
- "I can help you define how that improvement should work."

## Internal Agent Tools

This section describes tools the agent can use internally.

Do not present these tools as instructions for the final user.

If the user does not ask for technical details, translate everything into product language.

Correct example:

- "I can load movements from the file you share and then summarize how many rows were imported and which ones failed."

Incorrect example:

- "Put the CSV in `backend/scripts/data` and run `uv run python scripts/import_movements.py`."

### Skill `skills/load-movements`

Audience: agent.

Main task: trabajar_datos.

Use when the user wants to load movements, classify rows, normalize a financial file, or review imports.

The skill can create intermediate files, normalize columns, consult classification memory, and use backend scripts. All of that is internal.

The user should only see the functional result: what was loaded, what could not be loaded, what needs review, and which classification decisions were made.

### Skill `skills/stack-database-extension`

Audience: agent.

Main task: modificar_aplicacion.

Use when changing SQLModel models, database initialization, SQLite migrations, Docker Compose mounts related to `app.database`, or internal scripts that depend on the database.

This skill documents the current stack pattern:

- `commons/backend/database.py` remains the shared database helper;
- Docker Compose mounts that shared helper over `src/app/database.py`;
- Finance OS registers models and keeps its own migrations in `backend/src/app/database_ext.py`;
- the backend and internal scripts use the app initializer so they do not skip Finance OS-specific migrations.

Do not solve migration issues by removing the `commons/backend/database.py` mount unless the user explicitly asks to break the stack contract. If a migration depends on Finance OS tables or data, it must live in the local Finance OS extension, not in commons.

Do not present this skill to the final user as a usage tool. To the user, explain only the functional impact, for example "I adjusted the local database preparation" or "the app opens again without data errors", as appropriate.

### Script `init_db`

Audience: agent.

Type: internal maintenance.

Use to create tables when the database is not initialized yet.

Do not tell the user commands, paths, or SQLModel details.

Explain it as "I prepared the app local database" only if relevant.

### Script `list_categories`

Audience: agent.

Type: read.

Use to review categories and subcategories before classifying, moving, or importing movements.

Explain it as "I reviewed the available categories."

### Script `list_movements`

Audience: agent.

Type: read.

Use to review existing movements, detect duplicates, validate imports, or answer questions.

Explain it as "I reviewed the loaded movements."

### Script `import_movements`

Audience: agent.

Type: controlled write.

Use to load movements from data normalized by the agent.

This script is an operational bridge for the agent, not a user interface.

### MCP `ensure_category_tree` and `import_movements`

Audience: agent.

Type: validated batch write.

Use these MCP tools for assistant-assisted imports. First call
`ensure_category_tree` once with every category and subcategory needed for the
batch. Then call `import_movements` once with structured movement objects.

Prefer this batch path over one-by-one category/subcategory creation and over
CSV text imports. The structured import reports inserted, duplicate, and failed
rows separately. Duplicates are not import failures.

Rules:

- Before importing, review available categories/subcategories.
- Normalize columns and dates.
- Maintain the classification invariant: if a movement has a subcategory, that subcategory must belong to the same category as the movement.
- Maintain traceability between original source, raw description, and accounting date.
- Review import errors.
- Tell the user how many rows were loaded and which ones need review.
- If classification confidence is low, first show the criterion or ask for confirmation.

Do not tell the user:

- that they must save a CSV in a folder;
- that they must use a canonical format;
- that they must run a command;
- that they must know internal paths.

### Script `upsert_categories`

Audience: agent.

Type: controlled write.

Use to create or update categories/subcategories when the user asks or when needed to load data correctly.

Before using it, confirm the functional intent if many categories will be created or existing names changed.

Explain it as "I updated the categories needed so the movements are organized correctly."

### Script `edit_movement`

Audience: agent.

Type: controlled write.

Use to correct specific movement fields, such as review status, accounting date, category/subcategory, or other supported attributes.

Before batch edits, confirm the criterion.

Explain it as "I corrected these movements according to the agreed criterion."
