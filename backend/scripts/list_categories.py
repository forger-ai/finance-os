"""Print all categories and their subcategories as JSON.

Usage:

    uv run python scripts/list_categories.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Category
from app.utils import isoformat_z, to_pesos


def main() -> None:
    init_db()
    with Session(engine) as session:
        categories = session.exec(
            select(Category).order_by(Category.kind, Category.name)
        ).all()
        payload = []
        for category in categories:
            subcategories = sorted(category.subcategories, key=lambda sub: sub.name.lower())
            payload.append(
                {
                    "id": category.id,
                    "name": category.name,
                    "kind": category.kind.value,
                    "budget": to_pesos(category.budget) if category.budget is not None else None,
                    "createdAt": isoformat_z(category.created_at),
                    "updatedAt": isoformat_z(category.updated_at),
                    "subcategories": [
                        {
                            "id": sub.id,
                            "name": sub.name,
                            "budget": to_pesos(sub.budget) if sub.budget is not None else None,
                            "categoryId": sub.category_id,
                            "createdAt": isoformat_z(sub.created_at),
                            "updatedAt": isoformat_z(sub.updated_at),
                        }
                        for sub in subcategories
                    ],
                }
            )
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
