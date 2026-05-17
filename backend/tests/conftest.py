from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session, SQLModel

TEST_DB_PATH = Path(__file__).resolve().parent / ".finance_os_test.sqlite"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ.pop("FORGER_DESKTOP_RUNTIME_URL", None)
os.environ.pop("FORGER_DESKTOP_RUNTIME_APP_ID", None)
os.environ.pop("FORGER_DESKTOP_RUNTIME_SECRET", None)

from app.database import engine  # noqa: E402
from app.database_ext import init_app_db  # noqa: E402
from app.main import app  # noqa: E402
from tests.helpers import create_category, create_subcategory  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database() -> Generator[None, None, None]:
    init_app_db()
    _clear_database(engine)
    yield
    _clear_database(engine)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session() -> Generator[Session, None, None]:
    with Session(engine) as db_session:
        yield db_session


@pytest.fixture
def category_tree(client: TestClient) -> dict[str, dict[str, Any]]:
    expenses = create_category(client, "Gastos", "EXPENSE")
    groceries = create_subcategory(client, "Supermercado", expenses["id"])
    transport = create_subcategory(client, "Transporte", expenses["id"])
    income = create_category(client, "Ingresos", "INCOME")
    salary = create_subcategory(client, "Sueldo", income["id"])
    return {
        "expenses": expenses,
        "groceries": groceries,
        "transport": transport,
        "income": income,
        "salary": salary,
    }


def _clear_database(db_engine: Engine) -> None:
    with db_engine.begin() as connection:
        for table in reversed(SQLModel.metadata.sorted_tables):
            connection.execute(table.delete())

