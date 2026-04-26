"""Delete a single movement by id.

Usage:

    uv run python scripts/delete_movement.py --id <movement_id>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session

from app.database import engine, init_db
from app.models import Movement
from app.utils import isoformat_z, to_pesos


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    args = parser.parse_args(argv[1:])

    init_db()

    with Session(engine) as session:
        movement = session.get(Movement, args.id)
        if movement is None:
            print(f"Movement not found: {args.id}", file=sys.stderr)
            return 1

        sub = movement.subcategory
        category = sub.category
        payload = {
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

        session.delete(movement)
        session.commit()

    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
