"""Seed the database with FinanceOS' default categories and subcategories.

Idempotent: running it twice is safe; new entries are added, existing ones are
left alone (budget gets overwritten with the seed value).

Usage:

    uv run python scripts/seed.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Category, CategoryKind, Subcategory, utcnow
from app.utils import to_cents

SEED: list[dict[str, object]] = [
    {
        "name": "Income",
        "kind": "INCOME",
        "budget": None,
        "subcategories": ["Sueldo", "Bono", "Devolucion", "Reembolso", "Retiro ahorro"],
    },
    {
        "name": "Esencial fijo",
        "kind": "EXPENSE",
        "budget": "900000",
        "subcategories": [
            "Arriendo",
            "Gastos comunes",
            "Internet y telefono",
            "Luz",
            "Banco y mantenciones",
            "Supermercado",
        ],
    },
    {
        "name": "Ahorro",
        "kind": "EXPENSE",
        "budget": "700000",
        "subcategories": [
            "Fondo de emergencia",
            "Ahorro corto plazo",
            "Inversion",
            "Meta grande",
        ],
    },
    {
        "name": "Esencial variable",
        "kind": "EXPENSE",
        "budget": "650000",
        "subcategories": [
            "Minimarket",
            "Transporte",
            "Bencina",
            "Farmacia",
            "Mascota",
            "Hogar basico",
        ],
    },
    {
        "name": "No esencial",
        "kind": "EXPENSE",
        "budget": "300000",
        "subcategories": [
            "Delivery",
            "Restaurantes",
            "Cafe",
            "Salidas",
            "Entretencion",
            "Mascota",
            "Ropa",
            "Compras",
        ],
    },
    {
        "name": "Suscripciones",
        "kind": "EXPENSE",
        "budget": "100000",
        "subcategories": ["Streaming", "Herramientas", "Apps", "Membresias"],
    },
    {
        "name": "Extraordinario",
        "kind": "EXPENSE",
        "budget": "200000",
        "subcategories": [
            "Salud mayor",
            "Viajes",
            "Tramites",
            "Regalos",
            "Emergencias",
            "Reparaciones",
        ],
    },
    {
        "name": "No cobrable",
        "kind": "UNCHARGEABLE",
        "budget": None,
        "subcategories": [
            "Transferencia interna",
            "Ajuste",
            "Movimiento entre cuentas",
            "Dinero por rendir",
        ],
    },
]


def upsert_category(session: Session, payload: dict[str, object]) -> Category:
    name = str(payload["name"])
    kind = CategoryKind(str(payload["kind"]))
    budget_value = payload["budget"]
    budget = to_cents(budget_value) if budget_value not in (None, "") else None  # type: ignore[arg-type]

    existing = session.exec(
        select(Category).where(Category.name == name, Category.kind == kind)
    ).first()
    if existing is None:
        category = Category(name=name, kind=kind, budget=budget)
        session.add(category)
        session.commit()
        session.refresh(category)
        return category

    existing.budget = budget
    existing.updated_at = utcnow()
    session.add(existing)
    session.commit()
    session.refresh(existing)
    return existing


def upsert_subcategory(session: Session, category: Category, name: str) -> Subcategory:
    existing = session.exec(
        select(Subcategory).where(
            Subcategory.category_id == category.id,
            Subcategory.name == name,
        )
    ).first()
    if existing is not None:
        return existing
    sub = Subcategory(name=name, category_id=category.id)
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub


def main() -> None:
    init_db()
    with Session(engine) as session:
        for payload in SEED:
            category = upsert_category(session, payload)
            for sub_name in payload["subcategories"]:  # type: ignore[union-attr]
                upsert_subcategory(session, category, str(sub_name))

        category_count = len(session.exec(select(Category)).all())
        subcategory_count = len(session.exec(select(Subcategory)).all())

    print(f"Seed complete: {category_count} categories, {subcategory_count} subcategories.")


if __name__ == "__main__":
    main()
