"""Finance OS database extension points.

The stack provides ``app.database`` from commons in Docker. This module keeps
Finance OS-specific model registration and schema migrations local to the app
without forking the shared database helper.
"""

from sqlalchemy import text
from sqlmodel import SQLModel

from app import models as _models  # noqa: F401 - register SQLModel metadata
from app.database import DATABASE_URL, engine, init_db


def _movement_needs_category_migration(connection) -> bool:
    """Return true when the legacy movement table needs rebuilding."""
    rows = connection.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='movement'")
    ).fetchall()
    if not rows:
        return False

    info = connection.execute(text("PRAGMA table_info(movement)")).fetchall()
    cols = {row[1]: row for row in info}
    has_category = "category_id" in cols
    sub_notnull = bool(cols.get("subcategory_id") and cols["subcategory_id"][3] == 1)
    return (not has_category) or sub_notnull


def _migrate_movement_schema() -> None:
    """Add movement.category_id and allow category-only classification."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        if not _movement_needs_category_migration(conn):
            return

        legacy_rows = conn.execute(
            text(
                """
                SELECT m.id, m.date, m.accounting_date, m.amount_cents,
                       m.business, m.reason, m.source, m.raw_description,
                       m.reviewed, m.subcategory_id, s.category_id,
                       m.created_at, m.updated_at
                FROM movement m
                LEFT JOIN subcategory s ON s.id = m.subcategory_id
                """
            )
        ).fetchall()

        conn.execute(text("DROP TABLE movement"))

    SQLModel.metadata.create_all(engine)

    if not legacy_rows:
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO movement (
                    id, date, accounting_date, amount_cents, business, reason,
                    source, raw_description, reviewed, category_id,
                    subcategory_id, created_at, updated_at
                ) VALUES (
                    :id, :date, :accounting_date, :amount_cents, :business,
                    :reason, :source, :raw_description, :reviewed,
                    :category_id, :subcategory_id, :created_at, :updated_at
                )
                """
            ),
            [
                {
                    "id": row.id,
                    "date": row.date,
                    "accounting_date": row.accounting_date,
                    "amount_cents": row.amount_cents,
                    "business": row.business,
                    "reason": row.reason,
                    "source": row.source,
                    "raw_description": row.raw_description,
                    "reviewed": row.reviewed,
                    "category_id": row.category_id,
                    "subcategory_id": row.subcategory_id,
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                }
                for row in legacy_rows
            ],
        )


def _normalize_movement_amounts() -> None:
    """Keep movement amounts as positive magnitudes.

    Financial direction is represented by ``Category.kind``. Older dev builds
    briefly stored expenses as negative values, so existing local databases are
    normalized during app DB initialization.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='movement'")
        ).fetchall()
        if not rows:
            return
        conn.execute(text("UPDATE movement SET amount_cents = ABS(amount_cents)"))


def init_app_db() -> None:
    """Run Finance OS schema setup using the shared database helper."""
    _migrate_movement_schema()
    init_db()
    _normalize_movement_amounts()
