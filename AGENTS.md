# AGENTS

## Source Of Truth

This file is the main functional and operational context source for Finance OS agents.

Finance OS is a Forger app. It is installed and operated locally through Forger, but this file describes Finance OS itself: what the app currently does, what data it manages, which internal tools are available, and what must not be assumed.

`APP.md` is legacy documentation when present. Prioritize this `AGENTS.md`.

`manifest.json` describes installation, services, stack, prompt templates, app agents, official Forger tool declarations, internal scripts, and app skills. It is not a complete list of user-visible capabilities.

Skills, structured app tools, and scripts are internal agent tools. They can be used to complete user tasks, but they are not the normal user interface.

## Product Identity

Finance OS is a local personal finance app for one person.

Its purpose is to help the person load financial movements, organize them, review classifications, correct categories and subcategories, manage budgets where available, and understand summaries from the data already in the app.

Finance OS is not a bank, wallet, broker, multi-user system, remote finance service, or automatic account connector.

## Core Data

Finance OS works primarily with financial movements.

Movements can include dates, amounts, merchants, descriptions, sources, categories, subcategories, review status, and import traceability.

Categories and subcategories organize movements. A movement with a subcategory must stay consistent with the category that owns that subcategory.

Budget information exists by category or subcategory when it is present in the app data and visible app surfaces.

## User-Visible Capabilities

These are capabilities that can be described as current Finance OS behavior when the app state supports them.

### Load Financial Movements

The person can share financial movement data and ask to load it into Finance OS.

Input can come from files or content the agent can interpret, such as CSV, copied text, screenshots, images, PDFs, or statements. The safest path is to normalize the input into structured movements, validate it, then import only valid rows.

When a PDF or image is uploaded through the Finance OS interface, Finance OS asks Forger Desktop to run the declared `extract_movements_from_statement` prompt template. Finance OS does not store or use its own model provider key for that flow.

After loading, report how many movements were inserted, which rows were duplicates, which rows failed, and what needs review.

### Review Movements

The person can review loaded movements.

The app supports reviewing movement dates, amounts, merchants, descriptions, sources, categories, subcategories, and review status according to the data present.

The agent can answer questions about pending movements, large expenses, merchant activity, possible misclassifications, and summary patterns when the necessary data exists.

### Correct Classifications

The person can correct categories and subcategories.

The agent can help detect inconsistent classifications, suggest corrections, and apply confirmed changes.

Do not make broad classification changes by intuition. When confidence is low or many movements are affected, present the criterion or ask for confirmation first.

### Mark Movements As Reviewed

The person can mark movements as reviewed.

Review status separates confirmed information from items that still need attention.

Before marking many movements as reviewed, confirm that the person wants to consider those movements reviewed.

### See Financial Summaries

The app can show summaries based on loaded movements.

Summaries can include totals, sources, review progress, and groupings by category according to the available data.

If no movements are loaded or required fields are missing, the summary can be empty or limited.

### Manage Categories, Subcategories, And Budgets

The person can manage categories and subcategories.

The app supports renaming, moving, creating, and deleting categories or subcategories only when app data rules allow it.

Budget information can be managed when the relevant budget surfaces and data exist.

Do not describe Finance OS as a complete financial planning, goals, investment, or alert system unless that capability is implemented.

## Capabilities Not To Assume

Do not say Finance OS can do these things unless the person asks to add them or current app evidence shows they exist:

- Connect bank accounts automatically.
- Connect cards, wallets, or brokers.
- Sync balances in real time.
- Read email automatically.
- Create due date, budget, or unusual movement alerts.
- Provide login, user accounts, two-factor access, PINs, or biometrics.
- Manage investments as a connected portfolio.
- Manage debts, loans, or recurring payments as dedicated modules.
- Create advanced financial goals.
- Share data with other users.
- Export advanced reports that are not implemented.

If asked about an unsupported capability, say that it does not appear to be part of the current Finance OS and offer to define how that improvement should work.

## Data Safety

- Use only Finance OS data or files explicitly shared for the current task.
- Prefer previews or criteria before broad data changes.
- Confirm before deleting data, marking many movements reviewed, renaming important categories, or applying many classification changes.
- Preserve traceability between original source, raw description, accounting date, and imported movement.
- Treat duplicates as expected import outcomes, not necessarily failures.
- Do not expose internal paths, commands, scripts, table names, or tool names to the person unless technical detail is requested.

## Internal Agent Tools

Use structured app tools before scripts when they cover the operation. Structured tools preserve app validation and return clearer app-level errors.

Scripts remain useful for maintenance, verification, and fallback operations. They are internal agent tools, not user instructions.

### App Tools

Use `ensure_category_tree` and `import_movements` for assistant-assisted imports.

Call `ensure_category_tree` once with every category and subcategory needed for the import batch. Then call `import_movements` once with structured movement objects.

Prefer this batch path over one-by-one category creation and over text-only imports. The structured import reports inserted rows, duplicates, and failed rows separately.

Rules for movement imports:

- Review available categories and subcategories first.
- Normalize columns and dates.
- Keep category and subcategory relationships consistent.
- Keep traceability to the original source.
- Review import errors before reporting completion.
- Tell the person how many rows were loaded, duplicated, rejected, and left for review.

### Skill `skills/load-movements`

Use when the person wants to load movements, classify rows, normalize a financial file, or review imports.

This skill may create intermediate files, normalize columns, consult classification memory, and use internal app tools or scripts.

The final result should describe what was loaded, what could not be loaded, what needs review, and which classification decisions were made.

### Skill `skills/stack-database-extension`

Use when changing Finance OS data models, initialization, migrations, or internal scripts that depend on the local database.

This skill documents the current stack pattern and how Finance OS extends shared database behavior.

Do not solve migration issues by removing the shared stack mount unless the person explicitly asks to break that stack contract.

### Declared Scripts

- `init_db`: prepares local tables when the app database is not initialized.
- `list_categories`: reviews categories and subcategories before classification, movement, or import work.
- `list_movements`: reviews existing movements, detects duplicates, validates imports, or answers data questions.
- `import_movements`: loads normalized movement data when structured app tools are not the better fit.
- `upsert_categories`: creates or updates categories and subcategories.
- `edit_movement`: updates movement fields when a correction is confirmed.
- `delete_movement`: deletes movements only when the person clearly requests deletion and the scope is safe.
- `verify_data_integrity`: checks data consistency after imports or changes.
- `verify`: runs app verification when validating app changes.

## App Change Guidance

When changing Finance OS behavior, ground the work in the visible app result: screen, flow, data, button, wording, import behavior, summary behavior, or review behavior.

For data model or migration work, use `skills/stack-database-extension` first.

For movement loading or classification work, use `skills/load-movements` first.

For visible app changes, preserve the Forger app model: Finance OS remains a local app with user data stored locally and with Forger handling agent-powered flows declared in the manifest.

## Final Result Expectations

When completing Finance OS work, report the functional outcome:

- what was reviewed;
- what was loaded or changed;
- what was skipped or rejected;
- what still needs confirmation;
- what the person can check in the app.

Do not present scripts, commands, paths, internal tools, or implementation details as the normal user experience.
