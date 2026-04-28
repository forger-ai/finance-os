"""Create the SQLite database file and all tables.

Usage:

    uv run python scripts/init_db.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import DATABASE_URL
from app.database_ext import init_app_db as init_db


def main() -> None:
    init_db()
    print(f"Database initialized at {DATABASE_URL}")


if __name__ == "__main__":
    main()
