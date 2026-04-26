"""Edit fields on a single movement.

Usage:

    uv run python scripts/edit_movement.py --id <movement_id> \
        [--date YYYY-MM-DD] [--accounting-date YYYY-MM-DD] [--amount 1500] \
        [--business "Comercio"] [--reason "Detalle"] \
        [--source BANK|CREDIT_CARD|MANUAL] [--raw-description "Texto"] \
        [--reviewed true|false] [--subcategory "Arriendo"]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Movement, MovementSource, Subcategory, utcnow
from app.utils import isoformat_z, parse_boolean, parse_date_input, to_cents, to_pesos


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--date")
    parser.add_argument("--accounting-date", dest="accounting_date")
    parser.add_argument("--amount")
    parser.add_argument("--business")
    parser.add_argument("--reason")
    parser.add_argument("--source")
    parser.add_argument("--raw-description", dest="raw_description")
    parser.add_argument("--reviewed")
    parser.add_argument("--subcategory")
    args = parser.parse_args(argv[1:])

    init_db()

    with Session(engine) as session:
        movement = session.get(Movement, args.id)
        if movement is None:
            print(f"Movement not found: {args.id}", file=sys.stderr)
            return 1

        if args.date:
            movement.date = parse_date_input(args.date)
        if args.accounting_date:
            movement.accounting_date = parse_date_input(args.accounting_date)
        if args.amount:
            movement.amount_cents = to_cents(args.amount)
        if args.business:
            movement.business = args.business
        if args.reason:
            movement.reason = args.reason
        if args.source:
            movement.source = MovementSource(args.source.upper())
        if args.raw_description:
            movement.raw_description = args.raw_description
        if args.reviewed is not None:
            movement.reviewed = parse_boolean(args.reviewed)
        if args.subcategory:
            sub = session.exec(
                select(Subcategory)
                .where(Subcategory.name == args.subcategory)
                .order_by(Subcategory.created_at)
            ).first()
            if sub is None:
                print(f"Subcategory not found: {args.subcategory}", file=sys.stderr)
                return 1
            movement.subcategory_id = sub.id

        movement.updated_at = utcnow()
        session.add(movement)
        session.commit()
        session.refresh(movement)

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

    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
