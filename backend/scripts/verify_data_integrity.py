"""Verify persisted Finance OS data invariants."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session

from app.database import engine
from app.database_ext import init_app_db
from app.services.integrity import find_classification_mismatches


def main() -> int:
    init_app_db()
    with Session(engine) as session:
        mismatches = find_classification_mismatches(session)

    if not mismatches:
        print("Data integrity ok.")
        return 0

    print(
        json.dumps(
            {
                "error": "classification_mismatch",
                "count": len(mismatches),
                "mismatches": [mismatch.__dict__ for mismatch in mismatches],
            },
            indent=2,
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
