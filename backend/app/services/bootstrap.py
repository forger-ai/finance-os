"""Idempotent baseline records the API depends on."""

from __future__ import annotations

from sqlmodel import Session, select

from app.models import Category, CategoryKind, Subcategory

UNCLASSIFIED_NAME = "Sin clasificar"


def ensure_unclassified_subcategory(session: Session) -> Subcategory:
    """Return the "Sin clasificar" subcategory, creating it (and its parent) if missing.

    Used as the safe default when extracted movements can't be confidently mapped
    to an existing subcategory.
    """
    sub = session.exec(
        select(Subcategory).where(Subcategory.name == UNCLASSIFIED_NAME)
    ).first()
    if sub is not None:
        return sub

    category = session.exec(
        select(Category).where(
            Category.name == UNCLASSIFIED_NAME, Category.kind == CategoryKind.EXPENSE
        )
    ).first()
    if category is None:
        category = Category(name=UNCLASSIFIED_NAME, kind=CategoryKind.EXPENSE)
        session.add(category)
        session.commit()
        session.refresh(category)

    sub = Subcategory(name=UNCLASSIFIED_NAME, category_id=category.id)
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub
