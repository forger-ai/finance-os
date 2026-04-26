"""Import movements from a CSV file into the database.

Usage:

    uv run python scripts/import_movements.py path/to/file.csv
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session

from app.database import engine, init_db
from app.services.import_movements import import_movements_from_csv


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: import_movements.py <csv_path>", file=sys.stderr)
        return 2

    csv_path = Path(argv[1])
    if not csv_path.exists():
        print(f"File not found: {csv_path}", file=sys.stderr)
        return 1

    init_db()
    text = csv_path.read_text(encoding="utf-8")
    with Session(engine) as session:
        outcome = import_movements_from_csv(session, text, file_label=csv_path.name)

    print(json.dumps(outcome.to_dict(), indent=2, ensure_ascii=False))
    return 0 if outcome.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
