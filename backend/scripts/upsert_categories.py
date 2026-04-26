"""Bulk upsert categories and subcategories from a JSON file.

Input format (matches BOOTSTRAP.md from the original repo):

    [
      {
        "name": "Esencial fijo",
        "kind": "EXPENSE",
        "budget": "900000",
        "subcategories": ["Arriendo", "Luz", "Internet"]
      }
    ]

Usage:

    uv run python scripts/upsert_categories.py path/to/categories.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Category, CategoryKind, Subcategory, utcnow
from app.utils import to_cents

ALLOWED_KINDS = {kind.value for kind in CategoryKind}


def _assert_string(value: object, label: str) -> str:
    if not isinstance(value, str) or value.strip() == "":
        raise ValueError(f"Invalid {label}")
    return value.strip()


def _assert_kind(value: object) -> CategoryKind:
    text = _assert_string(value, "kind").upper()
    if text not in ALLOWED_KINDS:
        raise ValueError(f"Invalid kind: {value}")
    return CategoryKind(text)


def _assert_budget(value: object) -> int | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str | int | float):
        raise ValueError("Invalid budget")
    return to_cents(value)


def _assert_subcategories(value: object) -> list[str]:
    if not isinstance(value, list):
        raise ValueError("Subcategories must be an array")
    return [_assert_string(item, "subcategory") for item in value]


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: upsert_categories.py <categories.json>", file=sys.stderr)
        return 2

    path = Path(argv[1])
    if not path.exists():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        print("Input file must contain an array of categories", file=sys.stderr)
        return 1

    init_db()

    categories_upserted = 0
    subcategories_upserted = 0

    with Session(engine) as session:
        for item in payload:
            name = _assert_string(item.get("name"), "name")
            kind = _assert_kind(item.get("kind"))
            budget = _assert_budget(item.get("budget"))
            subcategories = _assert_subcategories(item.get("subcategories", []))

            existing = session.exec(
                select(Category).where(Category.name == name, Category.kind == kind)
            ).first()
            if existing is None:
                category = Category(name=name, kind=kind, budget=budget)
                session.add(category)
            else:
                existing.budget = budget
                existing.updated_at = utcnow()
                session.add(existing)
                category = existing

            session.commit()
            session.refresh(category)
            categories_upserted += 1

            for sub_name in subcategories:
                existing_sub = session.exec(
                    select(Subcategory).where(
                        Subcategory.category_id == category.id,
                        Subcategory.name == sub_name,
                    )
                ).first()
                if existing_sub is None:
                    sub = Subcategory(name=sub_name, category_id=category.id)
                    session.add(sub)
                    session.commit()
                subcategories_upserted += 1

    print(
        json.dumps(
            {
                "file": path.name,
                "categoriesUpserted": categories_upserted,
                "subcategoriesUpserted": subcategories_upserted,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
