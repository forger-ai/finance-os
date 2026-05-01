from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlmodel import Session, select

from app.database import engine
from app.database_ext import init_app_db
from app.mcp_runtime import ToolError, ToolRegistry, main
from app.models import Budget, Category, CategoryKind, Movement, Subcategory, utcnow
from app.routes.budgets import _serialize_budget
from app.routes.categories import _serialize_category
from app.routes.movements import _serialize_movement
from app.schemas import (
    BudgetCreate,
    BudgetUpdate,
    CategoryBudgetCreate,
    CategoryBudgetUpdate,
    CategoryCreate,
    CategoryMigrateMovements,
    CategoryUpdate,
    MovementCreate,
    MovementUpdate,
    SubcategoryBudgetCreate,
    SubcategoryBudgetUpdate,
    SubcategoryCreate,
    SubcategoryMoveMovements,
    SubcategoryUpdate,
)
from app.services.import_movements import (
    import_movements_from_csv,
    import_movements_structured,
)
from app.services.integrity import find_classification_mismatches
from app.utils import normalize_key

registry = ToolRegistry()


def _dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _require_string(args: dict[str, Any], name: str) -> str:
    value = args.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"{name} is required", code="invalid_input")
    return value.strip()


@registry.tool(
    "list_categories",
    "List Finance OS categories and their subcategories.",
)
def list_categories(_args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    with Session(engine) as session:
        categories = session.exec(select(Category).order_by(Category.kind, Category.name)).all()
        return {
            "success": True,
            "categories": [
                _dump(_serialize_category(category, session)) for category in categories
            ],
        }


@registry.tool(
    "ensure_category_tree",
    "Idempotently create or return categories and their subcategories in one batch.",
    {
        "type": "object",
        "properties": {
            "categories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "kind": {
                            "type": "string",
                            "enum": ["INCOME", "EXPENSE", "UNCHARGEABLE"],
                        },
                        "subcategories": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["name", "kind"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["categories"],
        "additionalProperties": False,
    },
)
def ensure_category_tree(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    raw_categories = args.get("categories")
    if not isinstance(raw_categories, list):
        raise ToolError("categories must be an array", code="invalid_input")

    created_categories = 0
    created_subcategories = 0
    result_categories: list[dict[str, Any]] = []
    with Session(engine) as session:
        for raw_category in raw_categories:
            if not isinstance(raw_category, dict):
                raise ToolError("Each category must be an object", code="invalid_input")
            name = str(raw_category.get("name", "")).strip()
            if not name:
                raise ToolError("Category name is required", code="invalid_input")
            try:
                kind = CategoryKind(str(raw_category.get("kind", "")).upper())
            except ValueError as exc:
                raise ToolError(
                    f"Invalid category kind for {name}", code="invalid_input"
                ) from exc

            category = next(
                (
                    candidate
                    for candidate in session.exec(
                        select(Category).where(Category.kind == kind)
                    ).all()
                    if normalize_key(candidate.name) == normalize_key(name)
                ),
                None,
            )
            if category is None:
                category = Category(name=name, kind=kind)
                session.add(category)
                session.commit()
                session.refresh(category)
                created_categories += 1
            else:
                category.updated_at = utcnow()
                session.add(category)
                session.commit()
                session.refresh(category)

            raw_subcategories = raw_category.get("subcategories", [])
            if raw_subcategories is None:
                raw_subcategories = []
            if not isinstance(raw_subcategories, list):
                raise ToolError(
                    f"subcategories for {name} must be an array",
                    code="invalid_input",
                )
            sub_results: list[dict[str, Any]] = []
            seen_sub_names: set[str] = set()
            for raw_subcategory in raw_subcategories:
                sub_name = str(raw_subcategory).strip()
                if not sub_name or sub_name.lower() in seen_sub_names:
                    continue
                seen_sub_names.add(sub_name.lower())
                created_subcategory = False
                subcategory = next(
                    (
                        candidate
                        for candidate in session.exec(
                            select(Subcategory).where(
                                Subcategory.category_id == category.id,
                            )
                        ).all()
                        if normalize_key(candidate.name) == normalize_key(sub_name)
                    ),
                    None,
                )
                if subcategory is None:
                    subcategory = Subcategory(name=sub_name, category_id=category.id)
                    session.add(subcategory)
                    session.commit()
                    session.refresh(subcategory)
                    created_subcategories += 1
                    created_subcategory = True
                sub_results.append(
                    {
                        "id": subcategory.id,
                        "name": subcategory.name,
                        "category_id": subcategory.category_id,
                        "created": created_subcategory,
                    }
                )
            serialized = _dump(_serialize_category(category, session))
            serialized["subcategories"] = sub_results or serialized.get("subcategories", [])
            result_categories.append(serialized)

    return {
        "success": True,
        "created": {
            "categories": created_categories,
            "subcategories": created_subcategories,
        },
        "categories": result_categories,
    }


@registry.tool(
    "create_category",
    "Create one Finance OS category.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "kind": {"type": "string", "enum": ["INCOME", "EXPENSE", "UNCHARGEABLE"]},
        },
        "required": ["name", "kind"],
        "additionalProperties": False,
    },
)
def create_category(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    payload = CategoryCreate(**args)
    with Session(engine) as session:
        from app.routes.categories import create_category as create_category_route

        category = create_category_route(payload, session)
        return {"success": True, "category": _dump(category)}


@registry.tool(
    "create_subcategory",
    "Create one Finance OS subcategory inside an existing category.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "category_id": {"type": "string"},
        },
        "required": ["name", "category_id"],
        "additionalProperties": False,
    },
)
def create_subcategory(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    payload = SubcategoryCreate(**args)
    with Session(engine) as session:
        from app.routes.categories import create_subcategory as create_subcategory_route

        subcategory = create_subcategory_route(payload, session)
        return {"success": True, "subcategory": _dump(subcategory)}


@registry.tool(
    "edit_category",
    "Rename one Finance OS category.",
    {
        "type": "object",
        "properties": {"category_id": {"type": "string"}, "name": {"type": "string"}},
        "required": ["category_id", "name"],
        "additionalProperties": False,
    },
)
def edit_category(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    category_id = _require_string(args, "category_id")
    payload = CategoryUpdate(name=_require_string(args, "name"))
    with Session(engine) as session:
        from app.routes.categories import update_category

        category = update_category(category_id, payload, session)
        return {"success": True, "category": _dump(category)}


@registry.tool(
    "delete_category",
    "Delete one Finance OS category if it has no movements.",
    {
        "type": "object",
        "properties": {"category_id": {"type": "string"}},
        "required": ["category_id"],
        "additionalProperties": False,
    },
)
def delete_category(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    category_id = _require_string(args, "category_id")
    with Session(engine) as session:
        from app.routes.categories import delete_category as delete_category_route

        result = delete_category_route(category_id, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "migrate_category_movements",
    "Move all movements from one category to another category or subcategory.",
    {
        "type": "object",
        "properties": {
            "category_id": {"type": "string"},
            "target_category_id": {"type": "string"},
            "target_subcategory_id": {"type": "string"},
        },
        "required": ["category_id", "target_category_id"],
        "additionalProperties": False,
    },
)
def migrate_category_movements(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    category_id = _require_string(args, "category_id")
    payload = CategoryMigrateMovements(
        target_category_id=_require_string(args, "target_category_id"),
        target_subcategory_id=args.get("target_subcategory_id"),
    )
    with Session(engine) as session:
        from app.routes.categories import migrate_category_movements as migrate_route

        result = migrate_route(category_id, payload, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "edit_subcategory",
    "Rename one Finance OS subcategory.",
    {
        "type": "object",
        "properties": {"subcategory_id": {"type": "string"}, "name": {"type": "string"}},
        "required": ["subcategory_id", "name"],
        "additionalProperties": False,
    },
)
def edit_subcategory(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    subcategory_id = _require_string(args, "subcategory_id")
    payload = SubcategoryUpdate(name=_require_string(args, "name"))
    with Session(engine) as session:
        from app.routes.categories import update_subcategory

        subcategory = update_subcategory(subcategory_id, payload, session)
        return {"success": True, "subcategory": _dump(subcategory)}


@registry.tool(
    "delete_subcategory",
    "Delete one Finance OS subcategory if it has no movements.",
    {
        "type": "object",
        "properties": {"subcategory_id": {"type": "string"}},
        "required": ["subcategory_id"],
        "additionalProperties": False,
    },
)
def delete_subcategory(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    subcategory_id = _require_string(args, "subcategory_id")
    with Session(engine) as session:
        from app.routes.categories import delete_subcategory as delete_subcategory_route

        result = delete_subcategory_route(subcategory_id, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "migrate_subcategory_movements",
    "Move all movements from one subcategory to another category or subcategory.",
    {
        "type": "object",
        "properties": {
            "subcategory_id": {"type": "string"},
            "target_category_id": {"type": "string"},
            "target_subcategory_id": {"type": "string"},
        },
        "required": ["subcategory_id"],
        "additionalProperties": False,
    },
)
def migrate_subcategory_movements(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    subcategory_id = _require_string(args, "subcategory_id")
    payload = SubcategoryMoveMovements(
        target_category_id=args.get("target_category_id"),
        target_subcategory_id=args.get("target_subcategory_id"),
    )
    with Session(engine) as session:
        from app.routes.categories import move_subcategory_movements

        result = move_subcategory_movements(subcategory_id, payload, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "list_movements",
    "List Finance OS movements with optional reviewed/category/subcategory filters.",
    {
        "type": "object",
        "properties": {
            "limit": {"type": "number", "minimum": 1, "maximum": 500},
            "reviewed": {"type": "boolean"},
            "categoryId": {"type": "string"},
            "subcategoryId": {"type": "string"},
        },
        "additionalProperties": False,
    },
)
def list_movements(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    limit = args.get("limit")
    resolved_limit = int(limit) if isinstance(limit, int | float) else 100
    resolved_limit = max(1, min(resolved_limit, 500))
    with Session(engine) as session:
        statement = select(Movement).order_by(
            Movement.accounting_date.desc(),  # type: ignore[union-attr]
            Movement.date.desc(),  # type: ignore[union-attr]
            Movement.created_at.desc(),  # type: ignore[union-attr]
        )
        if isinstance(args.get("reviewed"), bool):
            statement = statement.where(Movement.reviewed == args["reviewed"])
        if isinstance(args.get("categoryId"), str) and args["categoryId"].strip():
            statement = statement.where(Movement.category_id == args["categoryId"].strip())
        if isinstance(args.get("subcategoryId"), str) and args["subcategoryId"].strip():
            statement = statement.where(Movement.subcategory_id == args["subcategoryId"].strip())
        movements = session.exec(statement.limit(resolved_limit)).all()
        return {
            "success": True,
            "movements": [_dump(_serialize_movement(movement)) for movement in movements],
            "limit": resolved_limit,
        }


@registry.tool(
    "create_movement",
    "Create one validated Finance OS movement.",
    {
        "type": "object",
        "properties": {
            "date": {"type": "string"},
            "accounting_date": {"type": "string"},
            "amount": {"type": "number"},
            "business": {"type": "string"},
            "reason": {"type": "string"},
            "source": {"type": "string", "enum": ["BANK", "CREDIT_CARD", "MANUAL"]},
            "raw_description": {"type": "string"},
            "source_file": {"type": "string"},
            "external_id": {"type": "string"},
            "reviewed": {"type": "boolean"},
            "category_id": {"type": "string"},
            "subcategory_id": {"type": "string"},
        },
        "required": ["date", "amount", "business", "reason", "category_id"],
        "additionalProperties": False,
    },
)
def create_movement(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    payload = MovementCreate(**args)
    with Session(engine) as session:
        from app.routes.movements import create_movement as create_movement_route

        movement = create_movement_route(payload, session)
        return {"success": True, "movement": _dump(movement)}


@registry.tool(
    "edit_movement",
    "Edit one Finance OS movement, including classification and review state.",
    {
        "type": "object",
        "properties": {
            "movement_id": {"type": "string"},
            "category_id": {"type": "string"},
            "subcategory_id": {"type": "string"},
            "clear_subcategory": {"type": "boolean"},
            "reviewed": {"type": "boolean"},
            "accounting_date": {"type": "string"},
            "date": {"type": "string"},
            "amount": {"type": "number"},
            "business": {"type": "string"},
            "reason": {"type": "string"},
            "source": {"type": "string", "enum": ["BANK", "CREDIT_CARD", "MANUAL"]},
            "raw_description": {"type": ["string", "null"]},
            "source_file": {"type": ["string", "null"]},
            "external_id": {"type": ["string", "null"]},
        },
        "required": ["movement_id"],
        "additionalProperties": False,
    },
)
def edit_movement(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    movement_id = _require_string(args, "movement_id")
    payload_args = {key: value for key, value in args.items() if key != "movement_id"}
    payload = MovementUpdate(**payload_args)
    with Session(engine) as session:
        from app.routes.movements import update_movement

        movement = update_movement(movement_id, payload, session)
        return {"success": True, "movement": _dump(movement)}


@registry.tool(
    "delete_movement",
    "Delete one Finance OS movement by ID.",
    {
        "type": "object",
        "properties": {"movement_id": {"type": "string"}},
        "required": ["movement_id"],
        "additionalProperties": False,
    },
)
def delete_movement(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    movement_id = _require_string(args, "movement_id")
    with Session(engine) as session:
        movement = session.get(Movement, movement_id)
        if movement is None:
            raise ToolError("Movement not found", code="not_found")
        session.delete(movement)
        session.commit()
        return {"success": True, "deletedMovementId": movement_id}


@registry.tool(
    "import_csv_text",
    (
        "Legacy fallback: import movements from CSV text. "
        "Prefer import_movements for assistant batches."
    ),
    {
        "type": "object",
        "properties": {
            "csv_text": {"type": "string"},
            "file_label": {"type": "string"},
        },
        "required": ["csv_text"],
        "additionalProperties": False,
    },
)
def import_csv_text(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    csv_text = _require_string(args, "csv_text")
    file_label = args.get("file_label") if isinstance(args.get("file_label"), str) else "mcp.csv"
    with Session(engine) as session:
        outcome = import_movements_from_csv(session, csv_text, file_label=file_label)
        return {"success": outcome.failed == 0, "import": outcome.to_dict()}


@registry.tool(
    "import_movements",
    "Import a structured movement batch using Finance OS validation and deduplication.",
    {
        "type": "object",
        "properties": {
            "source_label": {"type": "string"},
            "movements": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string"},
                        "accounting_date": {"type": "string"},
                        "amount": {"type": "number"},
                        "business": {"type": "string"},
                        "reason": {"type": "string"},
                        "description": {"type": "string"},
                        "source": {
                            "type": "string",
                            "enum": ["BANK", "CREDIT_CARD", "MANUAL"],
                        },
                        "raw_description": {"type": "string"},
                        "source_file": {"type": "string"},
                        "external_id": {"type": "string"},
                        "source_row": {"type": "string"},
                        "reviewed": {"type": "boolean"},
                        "category_id": {"type": "string"},
                        "category": {"type": "string"},
                        "category_kind": {
                            "type": "string",
                            "enum": ["INCOME", "EXPENSE", "UNCHARGEABLE"],
                        },
                        "subcategory_id": {"type": "string"},
                        "subcategory": {"type": "string"},
                    },
                    "required": ["date", "amount"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["movements"],
        "additionalProperties": False,
    },
)
def import_movements(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    raw_movements = args.get("movements")
    if not isinstance(raw_movements, list):
        raise ToolError("movements must be an array", code="invalid_input")
    source_label = (
        args.get("source_label")
        if isinstance(args.get("source_label"), str) and args["source_label"].strip()
        else "assistant-import"
    )
    with Session(engine) as session:
        outcome = import_movements_structured(
            session,
            [item for item in raw_movements if isinstance(item, dict)],
            file_label=str(source_label),
        )
        return {"success": outcome.failed == 0, "import": outcome.to_dict()}


@registry.tool(
    "list_budgets",
    "List Finance OS budget periods and their category/subcategory budget rows.",
)
def list_budgets(_args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    with Session(engine) as session:
        budgets = session.exec(
            select(Budget).order_by(text("year DESC"), text("month DESC"))
        ).all()
        return {
            "success": True,
            "budgets": [_dump(_serialize_budget(budget, session)) for budget in budgets],
        }


@registry.tool(
    "create_budget",
    "Create one Finance OS budget period.",
    {
        "type": "object",
        "properties": {
            "month": {"type": "number", "minimum": 1, "maximum": 12},
            "year": {"type": "number", "minimum": 1900, "maximum": 9999},
        },
        "required": ["month", "year"],
        "additionalProperties": False,
    },
)
def create_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    payload = BudgetCreate(month=int(args["month"]), year=int(args["year"]))
    with Session(engine) as session:
        from app.routes.budgets import create_budget as create_budget_route

        budget = create_budget_route(payload, session)
        return {"success": True, "budget": _dump(budget)}


@registry.tool(
    "edit_budget",
    "Edit one Finance OS budget period.",
    {
        "type": "object",
        "properties": {
            "budget_id": {"type": "string"},
            "month": {"type": "number", "minimum": 1, "maximum": 12},
            "year": {"type": "number", "minimum": 1900, "maximum": 9999},
        },
        "required": ["budget_id"],
        "additionalProperties": False,
    },
)
def edit_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    budget_id = _require_string(args, "budget_id")
    payload = BudgetUpdate(
        month=int(args["month"]) if isinstance(args.get("month"), int | float) else None,
        year=int(args["year"]) if isinstance(args.get("year"), int | float) else None,
    )
    with Session(engine) as session:
        from app.routes.budgets import update_budget

        budget = update_budget(budget_id, payload, session)
        return {"success": True, "budget": _dump(budget)}


@registry.tool(
    "delete_budget",
    "Delete one Finance OS budget period.",
    {
        "type": "object",
        "properties": {"budget_id": {"type": "string"}},
        "required": ["budget_id"],
        "additionalProperties": False,
    },
)
def delete_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    budget_id = _require_string(args, "budget_id")
    with Session(engine) as session:
        from app.routes.budgets import delete_budget as delete_budget_route

        result = delete_budget_route(budget_id, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "create_category_budget",
    "Create one category budget row inside a Finance OS budget period.",
    {
        "type": "object",
        "properties": {
            "budget_id": {"type": "string"},
            "category_id": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["budget_id", "category_id", "amount"],
        "additionalProperties": False,
    },
)
def create_category_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    budget_id = _require_string(args, "budget_id")
    payload = CategoryBudgetCreate(
        category_id=_require_string(args, "category_id"),
        amount=float(args["amount"]),
    )
    with Session(engine) as session:
        from app.routes.budgets import create_category_budget as create_route

        row = create_route(budget_id, payload, session)
        return {"success": True, "categoryBudget": _dump(row)}


@registry.tool(
    "edit_category_budget",
    "Edit one category budget row.",
    {
        "type": "object",
        "properties": {
            "row_id": {"type": "string"},
            "category_id": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["row_id"],
        "additionalProperties": False,
    },
)
def edit_category_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    row_id = _require_string(args, "row_id")
    payload = CategoryBudgetUpdate(
        category_id=args.get("category_id"),
        amount=float(args["amount"]) if isinstance(args.get("amount"), int | float) else None,
    )
    with Session(engine) as session:
        from app.routes.budgets import update_category_budget

        row = update_category_budget(row_id, payload, session)
        return {"success": True, "categoryBudget": _dump(row)}


@registry.tool(
    "delete_category_budget",
    "Delete one category budget row.",
    {
        "type": "object",
        "properties": {"row_id": {"type": "string"}},
        "required": ["row_id"],
        "additionalProperties": False,
    },
)
def delete_category_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    row_id = _require_string(args, "row_id")
    with Session(engine) as session:
        from app.routes.budgets import delete_category_budget as delete_route

        result = delete_route(row_id, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "create_subcategory_budget",
    "Create one subcategory budget row inside a Finance OS budget period.",
    {
        "type": "object",
        "properties": {
            "budget_id": {"type": "string"},
            "subcategory_id": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["budget_id", "subcategory_id", "amount"],
        "additionalProperties": False,
    },
)
def create_subcategory_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    budget_id = _require_string(args, "budget_id")
    payload = SubcategoryBudgetCreate(
        subcategory_id=_require_string(args, "subcategory_id"),
        amount=float(args["amount"]),
    )
    with Session(engine) as session:
        from app.routes.budgets import create_subcategory_budget as create_route

        row = create_route(budget_id, payload, session)
        return {"success": True, "subcategoryBudget": _dump(row)}


@registry.tool(
    "edit_subcategory_budget",
    "Edit one subcategory budget row.",
    {
        "type": "object",
        "properties": {
            "row_id": {"type": "string"},
            "subcategory_id": {"type": "string"},
            "amount": {"type": "number"},
        },
        "required": ["row_id"],
        "additionalProperties": False,
    },
)
def edit_subcategory_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    row_id = _require_string(args, "row_id")
    payload = SubcategoryBudgetUpdate(
        subcategory_id=args.get("subcategory_id"),
        amount=float(args["amount"]) if isinstance(args.get("amount"), int | float) else None,
    )
    with Session(engine) as session:
        from app.routes.budgets import update_subcategory_budget

        row = update_subcategory_budget(row_id, payload, session)
        return {"success": True, "subcategoryBudget": _dump(row)}


@registry.tool(
    "delete_subcategory_budget",
    "Delete one subcategory budget row.",
    {
        "type": "object",
        "properties": {"row_id": {"type": "string"}},
        "required": ["row_id"],
        "additionalProperties": False,
    },
)
def delete_subcategory_budget(args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    row_id = _require_string(args, "row_id")
    with Session(engine) as session:
        from app.routes.budgets import delete_subcategory_budget as delete_route

        result = delete_route(row_id, session)
        return {"success": True, "result": _dump(result)}


@registry.tool(
    "verify_data_integrity",
    "Run Finance OS data integrity checks.",
)
def verify_data_integrity(_args: dict[str, Any]) -> dict[str, Any]:
    init_app_db()
    with Session(engine) as session:
        mismatches = find_classification_mismatches(session)
        return {
            "success": len(mismatches) == 0,
            "result": {
                "ok": len(mismatches) == 0,
                "classificationMismatchCount": len(mismatches),
                "mismatches": [mismatch.__dict__ for mismatch in mismatches],
            },
        }


if __name__ == "__main__":
    main(registry, server_name="finance-os")
