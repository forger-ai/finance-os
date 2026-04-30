"""Data integrity checks for Finance OS."""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from app.models import Movement, Subcategory


@dataclass(frozen=True)
class ClassificationMismatch:
    movement_id: str
    category_id: str
    subcategory_id: str
    expected_category_id: str | None


def find_classification_mismatches(session: Session) -> list[ClassificationMismatch]:
    """Return movements whose category/subcategory invariant is broken."""
    movements = session.exec(
        select(Movement).where(Movement.subcategory_id.is_not(None))  # type: ignore[union-attr]
    ).all()
    mismatches: list[ClassificationMismatch] = []
    for movement in movements:
        if movement.subcategory_id is None:
            continue
        subcategory = session.get(Subcategory, movement.subcategory_id)
        expected_category_id = subcategory.category_id if subcategory is not None else None
        if expected_category_id != movement.category_id:
            mismatches.append(
                ClassificationMismatch(
                    movement_id=movement.id,
                    category_id=movement.category_id,
                    subcategory_id=movement.subcategory_id,
                    expected_category_id=expected_category_id,
                )
            )
    return mismatches
