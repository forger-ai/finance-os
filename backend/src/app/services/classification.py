"""Classification invariants for movements."""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session

from app.models import Category, Subcategory


class ClassificationError(ValueError):
    """Raised when a movement classification would be inconsistent."""


@dataclass(frozen=True)
class ResolvedClassification:
    category: Category
    subcategory: Subcategory | None


def resolve_movement_classification(
    session: Session,
    *,
    category_id: str | None,
    subcategory_id: str | None,
) -> ResolvedClassification:
    """Resolve and validate a movement classification.

    Invariant:
    - every movement has a category;
    - if it has a subcategory, that subcategory belongs to the same category.

    When only ``subcategory_id`` is provided, the category is derived from it.
    That lets UI flows assign a subcategory without duplicating parent data,
    while still rejecting explicit mismatches.
    """
    subcategory: Subcategory | None = None
    resolved_category_id = category_id

    if subcategory_id is not None:
        subcategory = session.get(Subcategory, subcategory_id)
        if subcategory is None:
            raise ClassificationError("Subcategoría no encontrada.")
        if resolved_category_id is None:
            resolved_category_id = subcategory.category_id

    if resolved_category_id is None:
        raise ClassificationError("Categoría no encontrada.")

    category = session.get(Category, resolved_category_id)
    if category is None:
        raise ClassificationError("Categoría no encontrada.")

    if subcategory is not None and subcategory.category_id != category.id:
        raise ClassificationError("La subcategoría no pertenece a la categoría indicada.")

    return ResolvedClassification(category=category, subcategory=subcategory)
