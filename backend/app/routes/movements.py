"""Endpoints for movements: list, create, update, delete and the dashboard summary."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from pydantic import BaseModel, ConfigDict

from app.database import get_session
from app.models import Category, Movement, MovementSource, Subcategory, utcnow
from app.schemas import (
    ActionResult,
    MovementCreate,
    MovementRead,
    MovementUpdate,
    SummaryRead,
    SummarySourceCounts,
)
from app.services.bootstrap import UNCLASSIFIED_NAME
from app.services.classification_memory import (
    build_classification_memory,
    memory_index,
)
from app.utils import normalize_key, parse_action_date, parse_date_input, to_cents, to_pesos

router = APIRouter(prefix="/api", tags=["movements"])


def _serialize_movement(movement: Movement) -> MovementRead:
    category = movement.category
    sub = movement.subcategory
    return MovementRead(
        id=movement.id,
        date=movement.date,
        accounting_date=movement.accounting_date,
        amount=to_pesos(movement.amount_cents),
        business=movement.business,
        reason=movement.reason,
        source=movement.source,
        raw_description=movement.raw_description,
        reviewed=movement.reviewed,
        category_id=category.id,
        category_name=category.name,
        category_kind=category.kind,
        category_budget=to_pesos(category.budget) if category.budget is not None else None,
        subcategory_id=sub.id if sub is not None else None,
        subcategory_name=sub.name if sub is not None else None,
    )


@router.get("/movements", response_model=list[MovementRead])
def list_movements(session: Session = Depends(get_session)) -> list[MovementRead]:
    movements = session.exec(
        select(Movement).order_by(
            Movement.accounting_date.desc(),  # type: ignore[union-attr]
            Movement.date.desc(),  # type: ignore[union-attr]
            Movement.created_at.desc(),  # type: ignore[union-attr]
        )
    ).all()
    return [_serialize_movement(movement) for movement in movements]


@router.post("/movements", response_model=MovementRead, status_code=status.HTTP_201_CREATED)
def create_movement(
    payload: MovementCreate,
    session: Session = Depends(get_session),
) -> MovementRead:
    category = session.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    sub: Subcategory | None = None
    if payload.subcategory_id is not None:
        sub = session.get(Subcategory, payload.subcategory_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")
        if sub.category_id != category.id:
            raise HTTPException(
                status_code=400,
                detail="La subcategoría no pertenece a la categoría indicada.",
            )

    raw_date = parse_date_input(payload.date)
    accounting_date = (
        parse_date_input(payload.accounting_date) if payload.accounting_date else raw_date
    )
    movement = Movement(
        date=raw_date,
        accounting_date=accounting_date,
        amount_cents=to_cents(payload.amount),
        business=payload.business,
        reason=payload.reason,
        source=payload.source,
        raw_description=payload.raw_description,
        reviewed=payload.reviewed,
        category_id=category.id,
        subcategory_id=sub.id if sub is not None else None,
    )
    session.add(movement)
    session.commit()
    session.refresh(movement)
    return _serialize_movement(movement)


@router.patch("/movements/{movement_id}", response_model=MovementRead)
def update_movement(
    movement_id: str,
    payload: MovementUpdate,
    session: Session = Depends(get_session),
) -> MovementRead:
    movement = session.get(Movement, movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")

    fields = payload.model_fields_set

    # Categoría/subcategoría: priorizamos subcategory_id (incluye categoría
    # implícita); si solo viene category_id, limpiamos la sub. ``clear_subcategory``
    # permite forzar el caso "categoría sola" sobre un movimiento ya clasificado.
    if "subcategory_id" in fields and payload.subcategory_id is not None:
        sub = session.get(Subcategory, payload.subcategory_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")
        movement.subcategory_id = sub.id
        movement.category_id = sub.category_id
    elif "category_id" in fields and payload.category_id is not None:
        category = session.get(Category, payload.category_id)
        if category is None:
            raise HTTPException(status_code=404, detail="Categoría no encontrada.")
        movement.category_id = category.id
        # If the existing subcategory no longer belongs to the new category,
        # clear it. The user can pick a fresh sub afterwards if they want.
        if movement.subcategory_id is not None:
            current_sub = session.get(Subcategory, movement.subcategory_id)
            if current_sub is None or current_sub.category_id != category.id:
                movement.subcategory_id = None

    if payload.clear_subcategory:
        movement.subcategory_id = None

    if "reviewed" in fields and payload.reviewed is not None:
        movement.reviewed = payload.reviewed
    if "accounting_date" in fields and payload.accounting_date is not None:
        movement.accounting_date = parse_action_date(payload.accounting_date)
    if "date" in fields and payload.date is not None:
        movement.date = parse_action_date(payload.date)
    if "amount" in fields and payload.amount is not None:
        movement.amount_cents = to_cents(payload.amount)
    if "business" in fields and payload.business is not None:
        movement.business = payload.business
    if "reason" in fields and payload.reason is not None:
        movement.reason = payload.reason
    if "source" in fields and payload.source is not None:
        movement.source = payload.source
    if "raw_description" in fields:
        movement.raw_description = payload.raw_description

    movement.updated_at = utcnow()
    session.add(movement)
    session.commit()
    session.refresh(movement)
    return _serialize_movement(movement)


@router.delete("/movements/{movement_id}", response_model=ActionResult)
def delete_movement(
    movement_id: str,
    session: Session = Depends(get_session),
) -> ActionResult:
    movement = session.get(Movement, movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado.")
    session.delete(movement)
    session.commit()
    return ActionResult()


class ClassificationMemoryApplyResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)
    updated: int


@router.post(
    "/movements/apply-classification-memory",
    response_model=ClassificationMemoryApplyResult,
)
def apply_classification_memory(
    session: Session = Depends(get_session),
) -> ClassificationMemoryApplyResult:
    """Pre-classify pending movements using the user's confirmed history.

    For every pending (``reviewed=false``) movement currently in "Sin
    clasificar", look up its business in the memory built from
    ``reviewed=true`` movements. When the memory has a dominant subcategory,
    move the movement there but keep ``reviewed=false`` — it's a suggestion,
    not a confirmation, so the user still gets it in the review queue.
    """
    memory = build_classification_memory(session)
    if not memory:
        return ClassificationMemoryApplyResult(updated=0)
    lookup = memory_index(memory)

    # Pending movements that are still in the bootstrap "Sin clasificar"
    # category — that's our pool to backfill.
    candidates = session.exec(
        select(Movement)
        .join(Category, Movement.category_id == Category.id)
        .where(Movement.reviewed.is_(False))  # type: ignore[union-attr]
        .where(Category.name == UNCLASSIFIED_NAME)
    ).all()

    updated = 0
    for movement in candidates:
        match = lookup.get(normalize_key(movement.business or ""))
        if match is None:
            continue
        if (
            match.subcategory_id == movement.subcategory_id
            and match.category_id == movement.category_id
        ):
            continue
        movement.category_id = match.category_id
        movement.subcategory_id = match.subcategory_id
        movement.updated_at = utcnow()
        session.add(movement)
        updated += 1

    if updated:
        session.commit()
    return ClassificationMemoryApplyResult(updated=updated)


@router.get("/summary", response_model=SummaryRead)
def get_summary(session: Session = Depends(get_session)) -> SummaryRead:
    movements = session.exec(select(Movement)).all()
    total = len(movements)
    reviewed = sum(1 for movement in movements if movement.reviewed)
    sources = SummarySourceCounts(
        bank=sum(1 for m in movements if m.source == MovementSource.BANK),
        credit_card=sum(1 for m in movements if m.source == MovementSource.CREDIT_CARD),
        manual=sum(1 for m in movements if m.source == MovementSource.MANUAL),
    )
    # Touch ``Category`` so type checkers do not flag the unused import even though
    # serialization does the actual relationship walking elsewhere.
    _ = Category  # noqa: F841
    return SummaryRead(total=total, reviewed=reviewed, sources=sources)
