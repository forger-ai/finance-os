"""Print recent movements as JSON.

Usage:

    uv run python scripts/list_movements.py [--limit 50] [--reviewed true|false] \
        [--category "Esencial fijo"] [--subcategory "Arriendo"]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Category, Movement, Subcategory
from app.utils import isoformat_z, parse_boolean, to_pesos


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--reviewed", type=str, default=None)
    parser.add_argument("--category", type=str, default=None)
    parser.add_argument("--subcategory", type=str, default=None)
    args = parser.parse_args(argv[1:])

    init_db()

    with Session(engine) as session:
        statement = (
            select(Movement)
            .join(Subcategory, Movement.subcategory_id == Subcategory.id)
            .join(Category, Subcategory.category_id == Category.id)
            .order_by(
                Movement.accounting_date.desc(),  # type: ignore[union-attr]
                Movement.date.desc(),  # type: ignore[union-attr]
                Movement.created_at.desc(),  # type: ignore[union-attr]
            )
        )
        if args.reviewed is not None:
            statement = statement.where(Movement.reviewed == parse_boolean(args.reviewed))
        if args.category is not None:
            statement = statement.where(Category.name == args.category)
        if args.subcategory is not None:
            statement = statement.where(Subcategory.name == args.subcategory)

        statement = statement.limit(args.limit)
        movements = session.exec(statement).all()

        payload = []
        for movement in movements:
            sub = movement.subcategory
            category = sub.category
            payload.append(
                {
                    "id": movement.id,
                    "date": isoformat_z(movement.date),
                    "accountingDate": isoformat_z(movement.accounting_date),
                    "amount": to_pesos(movement.amount_cents),
                    "business": movement.business,
                    "reason": movement.reason,
                    "source": movement.source.value,
                    "rawDescription": movement.raw_description,
                    "reviewed": movement.reviewed,
                    "subcategory": {
                        "id": sub.id,
                        "name": sub.name,
                        "category": {
                            "id": category.id,
                            "name": category.name,
                            "kind": category.kind.value,
                        },
                    },
                }
            )

    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
