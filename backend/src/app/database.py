"""SQLite engine and session helpers."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.event import listens_for
from sqlmodel import Session, SQLModel, create_engine

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "finance_os.sqlite"


def _resolve_database_url() -> str:
    raw = os.getenv("DATABASE_URL")
    if raw:
        return raw
    DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{DEFAULT_DB_PATH}"


DATABASE_URL = _resolve_database_url()

# SQLite needs ``check_same_thread=False`` so FastAPI can share the connection across
# request handlers running in different threads.
_connect_args: dict[str, object] = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine: Engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
)


@listens_for(engine, "connect")
def _enable_sqlite_pragmas(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
    """Make sure SQLite enforces foreign keys for cascade/restrict semantics."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys = ON")
    finally:
        cursor.close()


def _movement_needs_category_migration(connection) -> bool:
    """True when the legacy ``movement`` schema is still in place.

    Legacy = ``subcategory_id NOT NULL`` and no ``category_id`` column.
    Running create_all on the new model would not fix that, so we have to
    rebuild the table by hand.
    """
    rows = connection.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='movement'"
        )
    ).fetchall()
    if not rows:
        return False
    info = connection.execute(text("PRAGMA table_info(movement)")).fetchall()
    cols = {row[1]: row for row in info}
    has_category = "category_id" in cols
    sub_notnull = bool(cols.get("subcategory_id") and cols["subcategory_id"][3] == 1)
    return (not has_category) or sub_notnull


def _migrate_movement_schema() -> None:
    """One-shot rebuild: add ``category_id``, allow null ``subcategory_id``.

    Idempotent: returns immediately when the table already matches the new
    schema. Runs in a single transaction so partial state is impossible.
    """
    with engine.begin() as conn:
        if not _movement_needs_category_migration(conn):
            return

        # Save existing rows with their derived category_id (from the
        # subcategory's category) — old rows always had a non-null sub.
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

        # Drop old table and let SQLModel.create_all rebuild with the new
        # schema. This whole operation is wrapped in a transaction.
        conn.execute(text("DROP TABLE movement"))

    # Recreate via SQLModel using the updated model.
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


def init_db() -> None:
    """Create all tables. Safe to call repeatedly."""
    # Importing models registers them with SQLModel.metadata.
    from app import models  # noqa: F401

    _migrate_movement_schema()
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session per request."""
    with Session(engine) as session:
        yield session
