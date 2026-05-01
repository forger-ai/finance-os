"""Finance OS database extension points.

The stack provides ``app.database`` from commons in Docker. This module keeps
Finance OS-specific model registration and schema migrations local to the app
without forking the shared database helper.
"""

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlmodel import SQLModel

from app import models as _models  # noqa: F401 - register SQLModel metadata
from app.database import DATABASE_URL, engine, init_db
from app.models import generate_id, utcnow


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


def _table_exists(connection, table_name: str) -> bool:
    rows = connection.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:table_name"),
        {"table_name": table_name},
    ).fetchall()
    return bool(rows)


def _columns(connection, table_name: str) -> set[str]:
    if not _table_exists(connection, table_name):
        return set()
    info = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in info}


def _periods_for_legacy_budget(connection) -> list[tuple[int, int]]:
    if not _table_exists(connection, "movement"):
        now = datetime.now()
        return [(now.month, now.year)]
    rows = connection.execute(
        text(
            """
            SELECT DISTINCT
              CAST(strftime('%m', accounting_date) AS INTEGER) AS month,
              CAST(strftime('%Y', accounting_date) AS INTEGER) AS year
            FROM movement
            WHERE accounting_date IS NOT NULL
            """
        )
    ).fetchall()
    periods = [(int(row.month), int(row.year)) for row in rows if row.month and row.year]
    if periods:
        return periods
    now = datetime.now()
    return [(now.month, now.year)]


def _ensure_budget_period(connection, *, month: int, year: int, timestamp: str) -> str:
    row = connection.execute(
        text("SELECT id FROM budget WHERE month=:month AND year=:year"),
        {"month": month, "year": year},
    ).fetchone()
    if row is not None:
        return str(row.id)
    budget_id = generate_id()
    connection.execute(
        text(
            """
            INSERT INTO budget (id, month, year, created_at, updated_at)
            VALUES (:id, :month, :year, :created_at, :updated_at)
            """
        ),
        {
            "id": budget_id,
            "month": month,
            "year": year,
            "created_at": timestamp,
            "updated_at": timestamp,
        },
    )
    return budget_id


def _migrate_legacy_budgets() -> None:
    """Copy legacy category/subcategory budget columns into period budget rows."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        category_has_budget = "budget" in _columns(conn, "category")
        subcategory_has_budget = "budget" in _columns(conn, "subcategory")
        if not category_has_budget and not subcategory_has_budget:
            return

        periods = _periods_for_legacy_budget(conn)
        timestamp = utcnow().isoformat()
        category_rows = (
            conn.execute(
                text("SELECT id, budget FROM category WHERE budget IS NOT NULL")
            ).fetchall()
            if category_has_budget
            else []
        )
        subcategory_rows = (
            conn.execute(
                text("SELECT id, budget FROM subcategory WHERE budget IS NOT NULL")
            ).fetchall()
            if subcategory_has_budget
            else []
        )

        for month, year in periods:
            budget_id = _ensure_budget_period(
                conn,
                month=month,
                year=year,
                timestamp=timestamp,
            )
            for row in category_rows:
                conn.execute(
                    text(
                        """
                        INSERT OR IGNORE INTO category_budget (
                          id, budget_id, category_id, amount_cents, created_at, updated_at
                        ) VALUES (
                          :id, :budget_id, :category_id, :amount_cents, :created_at, :updated_at
                        )
                        """
                    ),
                    {
                        "id": generate_id(),
                        "budget_id": budget_id,
                        "category_id": row.id,
                        "amount_cents": row.budget,
                        "created_at": timestamp,
                        "updated_at": timestamp,
                    },
                )
            for row in subcategory_rows:
                conn.execute(
                    text(
                        """
                        INSERT OR IGNORE INTO subcategory_budget (
                          id, budget_id, subcategory_id, amount_cents, created_at, updated_at
                        ) VALUES (
                          :id, :budget_id, :subcategory_id, :amount_cents, :created_at, :updated_at
                        )
                        """
                    ),
                    {
                        "id": generate_id(),
                        "budget_id": budget_id,
                        "subcategory_id": row.id,
                        "amount_cents": row.budget,
                        "created_at": timestamp,
                        "updated_at": timestamp,
                    },
                )

        try:
            if category_has_budget:
                conn.execute(text("ALTER TABLE category DROP COLUMN budget"))
            if subcategory_has_budget:
                conn.execute(text("ALTER TABLE subcategory DROP COLUMN budget"))
        except OperationalError:
            # Older SQLite builds may not support DROP COLUMN. The app models
            # and API ignore legacy columns after their data is copied.
            return


def _repair_movement_classifications() -> None:
    """Repair legacy category/subcategory mismatches.

    The runtime invariant is enforced in writers. This repair is only for local
    databases that were already left with ``movement.category_id`` pointing to a
    different category than ``movement.subcategory_id``.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='movement'")
        ).fetchall()
        if not rows:
            return
        conn.execute(
            text(
                """
                UPDATE movement
                SET category_id = (
                    SELECT subcategory.category_id
                    FROM subcategory
                    WHERE subcategory.id = movement.subcategory_id
                )
                WHERE subcategory_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM subcategory
                    WHERE subcategory.id = movement.subcategory_id
                      AND subcategory.category_id != movement.category_id
                  )
                """
            )
        )


def _ensure_movement_import_metadata() -> None:
    """Add import metadata used by structured batch imports and deduplication."""
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        if not _table_exists(conn, "movement"):
            return
        columns = _columns(conn, "movement")
        if "source_file" not in columns:
            conn.execute(text("ALTER TABLE movement ADD COLUMN source_file VARCHAR"))
        if "external_id" not in columns:
            conn.execute(text("ALTER TABLE movement ADD COLUMN external_id VARCHAR"))
        if "source_row" not in columns:
            conn.execute(text("ALTER TABLE movement ADD COLUMN source_row VARCHAR"))
        if "import_hash" not in columns:
            conn.execute(text("ALTER TABLE movement ADD COLUMN import_hash VARCHAR"))
        if "duplicate_warning" not in columns:
            conn.execute(text("ALTER TABLE movement ADD COLUMN duplicate_warning VARCHAR"))
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_movement_import_hash
                ON movement(import_hash)
                WHERE import_hash IS NOT NULL
                """
            )
        )


def init_app_db() -> None:
    """Run Finance OS schema setup using the shared database helper."""
    _migrate_movement_schema()
    init_db()
    _ensure_movement_import_metadata()
    _migrate_legacy_budgets()
    _repair_movement_classifications()
    _normalize_movement_amounts()
