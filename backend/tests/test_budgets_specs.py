from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.helpers import (
    create_budget,
    create_category,
    create_category_budget,
    create_subcategory_budget,
)

pytestmark = pytest.mark.bdd


def test_budget_period_crud_and_duplicate_period_conflicts(client: TestClient) -> None:
    # Given two period budgets that exist in the local finance database.
    may_budget = create_budget(client, month=5, year=2026)
    april_budget = create_budget(client, month=4, year=2026)

    # Then budgets are listed newest first with a user-facing period label.
    listed = client.get("/api/budgets")
    assert listed.status_code == 200
    assert [(item["year"], item["month"]) for item in listed.json()] == [
        (2026, 5),
        (2026, 4),
    ]
    assert listed.json()[0]["label"] == "2026-05"

    fetched = client.get(f"/api/budgets/{may_budget['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == may_budget["id"]
    assert fetched.json()["category_budgets"] == []
    assert fetched.json()["subcategory_budgets"] == []

    # When the user creates or updates another budget into an occupied period,
    # the API reports a conflict instead of duplicating the period.
    duplicate_create = client.post("/api/budgets", json={"month": 5, "year": 2026})
    assert duplicate_create.status_code == 409
    assert "periodo" in duplicate_create.json()["detail"].lower()

    duplicate_update = client.patch(
        f"/api/budgets/{april_budget['id']}",
        json={"month": 5, "year": 2026},
    )
    assert duplicate_update.status_code == 409
    assert "periodo" in duplicate_update.json()["detail"].lower()

    # And a non-conflicting update persists partial period edits.
    updated = client.patch(f"/api/budgets/{april_budget['id']}", json={"month": 3})
    assert updated.status_code == 200, updated.text
    assert updated.json()["month"] == 3
    assert updated.json()["year"] == 2026
    assert updated.json()["label"] == "2026-03"

    # Missing budgets fail consistently across read, update, and delete.
    assert client.get("/api/budgets/missing-budget").status_code == 404
    assert client.patch("/api/budgets/missing-budget", json={"month": 1}).status_code == 404
    assert client.delete("/api/budgets/missing-budget").status_code == 404

    deleted = client.delete(f"/api/budgets/{may_budget['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert client.get(f"/api/budgets/{may_budget['id']}").status_code == 404


def test_category_budget_rows_create_update_delete_and_conflict(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
) -> None:
    # Given a period budget and three categories that can receive budget rows.
    budget = create_budget(client, month=6, year=2026)
    expenses = category_tree["expenses"]
    income = category_tree["income"]
    housing = create_category(client, "Hogar", "EXPENSE")

    # When a category budget is created, it is returned and included in the
    # parent budget serialization.
    category_budget = create_category_budget(
        client,
        budget_id=budget["id"],
        category_id=expenses["id"],
        amount=125_500.25,
    )
    assert category_budget["budget_id"] == budget["id"]
    assert category_budget["category_id"] == expenses["id"]
    assert category_budget["category_name"] == expenses["name"]
    assert category_budget["amount"] == 125_500.25

    parent = client.get(f"/api/budgets/{budget['id']}")
    assert parent.status_code == 200
    assert parent.json()["category_budgets"] == [category_budget]

    # Missing parents and categories are rejected before writing rows.
    missing_budget = client.post(
        "/api/budgets/missing-budget/category-budgets",
        json={"category_id": expenses["id"], "amount": 1_000},
    )
    assert missing_budget.status_code == 404
    assert "budget" in missing_budget.json()["detail"].lower()

    missing_category = client.post(
        f"/api/budgets/{budget['id']}/category-budgets",
        json={"category_id": "missing-category", "amount": 1_000},
    )
    assert missing_category.status_code == 404
    assert "categoría" in missing_category.json()["detail"].lower()

    duplicate_create = client.post(
        f"/api/budgets/{budget['id']}/category-budgets",
        json={"category_id": expenses["id"], "amount": 1_500},
    )
    assert duplicate_create.status_code == 409

    # Updating can change amount and target category, but still honors unique
    # row constraints for one category per budget period.
    moved = client.patch(
        f"/api/category-budgets/{category_budget['id']}",
        json={"category_id": housing["id"], "amount": 90_000},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["category_id"] == housing["id"]
    assert moved.json()["amount"] == 90_000

    existing_income_row = create_category_budget(
        client,
        budget_id=budget["id"],
        category_id=income["id"],
        amount=250_000,
    )
    duplicate_update = client.patch(
        f"/api/category-budgets/{category_budget['id']}",
        json={"category_id": income["id"]},
    )
    assert duplicate_update.status_code == 409

    missing_update_category = client.patch(
        f"/api/category-budgets/{category_budget['id']}",
        json={"category_id": "missing-category"},
    )
    assert missing_update_category.status_code == 404
    assert "categoría" in missing_update_category.json()["detail"].lower()

    # Missing row and delete branches return clear outcomes.
    assert client.patch("/api/category-budgets/missing-row", json={"amount": 1}).status_code == 404
    assert client.delete("/api/category-budgets/missing-row").status_code == 404

    deleted = client.delete(f"/api/category-budgets/{category_budget['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert client.delete(f"/api/category-budgets/{category_budget['id']}").status_code == 404

    still_present = client.get(f"/api/budgets/{budget['id']}")
    assert still_present.status_code == 200
    assert still_present.json()["category_budgets"] == [existing_income_row]


def test_subcategory_budget_rows_create_update_delete_and_conflict(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
) -> None:
    # Given a period budget and subcategories from different category trees.
    budget = create_budget(client, month=7, year=2026)
    groceries = category_tree["groceries"]
    transport = category_tree["transport"]
    salary = category_tree["salary"]

    # When a subcategory budget is created, its parent category context is
    # serialized with the row and the parent budget.
    subcategory_budget = create_subcategory_budget(
        client,
        budget_id=budget["id"],
        subcategory_id=groceries["id"],
        amount=45_250.75,
    )
    assert subcategory_budget["budget_id"] == budget["id"]
    assert subcategory_budget["subcategory_id"] == groceries["id"]
    assert subcategory_budget["subcategory_name"] == groceries["name"]
    assert subcategory_budget["category_id"] == category_tree["expenses"]["id"]
    assert subcategory_budget["amount"] == 45_250.75

    parent = client.get(f"/api/budgets/{budget['id']}")
    assert parent.status_code == 200
    assert parent.json()["subcategory_budgets"] == [subcategory_budget]

    # Missing parents and subcategories are rejected before writing rows.
    missing_budget = client.post(
        "/api/budgets/missing-budget/subcategory-budgets",
        json={"subcategory_id": groceries["id"], "amount": 1_000},
    )
    assert missing_budget.status_code == 404
    assert "budget" in missing_budget.json()["detail"].lower()

    missing_subcategory = client.post(
        f"/api/budgets/{budget['id']}/subcategory-budgets",
        json={"subcategory_id": "missing-subcategory", "amount": 1_000},
    )
    assert missing_subcategory.status_code == 404
    assert "subcategoría" in missing_subcategory.json()["detail"].lower()

    duplicate_create = client.post(
        f"/api/budgets/{budget['id']}/subcategory-budgets",
        json={"subcategory_id": groceries["id"], "amount": 1_500},
    )
    assert duplicate_create.status_code == 409

    # Updating can change amount and target subcategory, but still honors unique
    # row constraints for one subcategory per budget period.
    moved = client.patch(
        f"/api/subcategory-budgets/{subcategory_budget['id']}",
        json={"subcategory_id": transport["id"], "amount": 35_000},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["subcategory_id"] == transport["id"]
    assert moved.json()["category_id"] == category_tree["expenses"]["id"]
    assert moved.json()["amount"] == 35_000

    existing_salary_row = create_subcategory_budget(
        client,
        budget_id=budget["id"],
        subcategory_id=salary["id"],
        amount=700_000,
    )
    duplicate_update = client.patch(
        f"/api/subcategory-budgets/{subcategory_budget['id']}",
        json={"subcategory_id": salary["id"]},
    )
    assert duplicate_update.status_code == 409

    missing_update_subcategory = client.patch(
        f"/api/subcategory-budgets/{subcategory_budget['id']}",
        json={"subcategory_id": "missing-subcategory"},
    )
    assert missing_update_subcategory.status_code == 404
    assert "subcategoría" in missing_update_subcategory.json()["detail"].lower()

    # Missing row and delete branches return clear outcomes.
    missing_update_row = client.patch("/api/subcategory-budgets/missing-row", json={"amount": 1})
    assert missing_update_row.status_code == 404
    assert client.delete("/api/subcategory-budgets/missing-row").status_code == 404

    deleted = client.delete(f"/api/subcategory-budgets/{subcategory_budget['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert client.delete(f"/api/subcategory-budgets/{subcategory_budget['id']}").status_code == 404

    still_present = client.get(f"/api/budgets/{budget['id']}")
    assert still_present.status_code == 200
    assert still_present.json()["subcategory_budgets"] == [existing_salary_row]
