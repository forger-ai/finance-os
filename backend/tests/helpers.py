from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import Category, CategoryKind, MovementSource, Subcategory


def create_category(client: TestClient, name: str, kind: str) -> dict[str, Any]:
    response = client.post("/api/categories", json={"name": name, "kind": kind})
    assert response.status_code == 201, response.text
    return response.json()


def create_subcategory(client: TestClient, name: str, category_id: str) -> dict[str, Any]:
    response = client.post(
        "/api/subcategories",
        json={"name": name, "category_id": category_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_budget(client: TestClient, *, month: int = 5, year: int = 2026) -> dict[str, Any]:
    response = client.post("/api/budgets", json={"month": month, "year": year})
    assert response.status_code == 201, response.text
    return response.json()


def create_category_budget(
    client: TestClient,
    *,
    budget_id: str,
    category_id: str,
    amount: float = 100_000,
) -> dict[str, Any]:
    response = client.post(
        f"/api/budgets/{budget_id}/category-budgets",
        json={"category_id": category_id, "amount": amount},
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_subcategory_budget(
    client: TestClient,
    *,
    budget_id: str,
    subcategory_id: str,
    amount: float = 50_000,
) -> dict[str, Any]:
    response = client.post(
        f"/api/budgets/{budget_id}/subcategory-budgets",
        json={"subcategory_id": subcategory_id, "amount": amount},
    )
    assert response.status_code == 201, response.text
    return response.json()


def movement_payload(
    *,
    category_id: str,
    subcategory_id: str | None = None,
    business: str = "Mercado Central",
    amount: float = 12_990,
    reviewed: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "date": "2026-05-01",
        "accounting_date": "2026-05-02",
        "amount": amount,
        "business": business,
        "reason": f"Compra en {business}",
        "source": MovementSource.MANUAL.value,
        "raw_description": f"{business} raw",
        "source_file": "manual-entry",
        "external_id": f"manual-{business.lower().replace(' ', '-')}",
        "source_row": "1",
        "reviewed": reviewed,
        "category_id": category_id,
    }
    if subcategory_id is not None:
        payload["subcategory_id"] = subcategory_id
    return payload


def seed_category(
    session: Session,
    *,
    name: str,
    kind: CategoryKind = CategoryKind.EXPENSE,
) -> Category:
    category = Category(name=name, kind=kind)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def seed_subcategory(session: Session, *, name: str, category: Category) -> Subcategory:
    subcategory = Subcategory(name=name, category_id=category.id)
    session.add(subcategory)
    session.commit()
    session.refresh(subcategory)
    return subcategory
