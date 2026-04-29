from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.database import engine
from app.database_ext import init_app_db
from app.mcp_runtime import ToolError, ToolRegistry, main
from app.models import Category, Movement
from app.routes.categories import _serialize_category
from app.routes.movements import _serialize_movement
from app.schemas import CategoryCreate, MovementCreate, MovementUpdate, SubcategoryCreate
from app.services.import_movements import import_movements_from_csv
from app.services.integrity import find_classification_mismatches

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
    "create_category",
    "Create one Finance OS category.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "kind": {"type": "string", "enum": ["INCOME", "EXPENSE", "UNCHARGEABLE"]},
            "budget": {"type": ["number", "null"]},
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
            "budget": {"type": ["number", "null"]},
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
    "Import movements from CSV text using Finance OS validation and duplicate detection.",
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
