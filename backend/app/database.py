"""SQLite engine and session helpers."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

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


def init_db() -> None:
    """Create all tables. Safe to call repeatedly."""
    # Importing models registers them with SQLModel.metadata.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session per request."""
    with Session(engine) as session:
        yield session
