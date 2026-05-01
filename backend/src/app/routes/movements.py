"""Endpoints for movements: list, create, update, delete and the dashboard summary."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.database import get_session
from app.models import Category, Movement, MovementSource, utcnow
from app.schemas import (
    ActionResult,
    MovementCreate,
    MovementRead,
    MovementUpdate,
    SummaryRead,
    SummarySourceCounts,
)
from app.services.classification import (
    ClassificationError,
    resolve_movement_classification,
)
from app.services.classification_memory import (
    build_classification_memory,
    memory_index,
)
from app.utils import (
    normalize_key,
    parse_action_date,
    parse_date_input,
    to_pesos,
    to_positive_cents,
)

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
        source_file=movement.source_file,
        external_id=movement.external_id,
        source_row=movement.source_row,
        import_hash=movement.import_hash,
        duplicate_warning=movement.duplicate_warning,
        reviewed=movement.reviewed,
        category_id=category.id,
        category_name=category.name,
        category_kind=category.kind,
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
    try:
        classification = resolve_movement_classification(
            session,
            category_id=payload.category_id,
            subcategory_id=payload.subcategory_id,
        )
    except ClassificationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    raw_date = parse_date_input(payload.date)
    accounting_date = (
        parse_date_input(payload.accounting_date) if payload.accounting_date else raw_date
    )
    movement = Movement(
        date=raw_date,
        accounting_date=accounting_date,
        amount_cents=to_positive_cents(payload.amount),
        business=payload.business,
        reason=payload.reason,
        source=payload.source,
        raw_description=payload.raw_description,
        source_file=payload.source_file,
        external_id=payload.external_id,
        source_row=payload.source_row,
        reviewed=payload.reviewed,
        category_id=classification.category.id,
        subcategory_id=classification.subcategory.id
        if classification.subcategory is not None
        else None,
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

    classification_changed = (
        "category_id" in fields or "subcategory_id" in fields or bool(payload.clear_subcategory)
    )
    if classification_changed:
        if "category_id" in fields and payload.category_id is not None:
            next_category_id = payload.category_id
        elif "subcategory_id" in fields and not payload.clear_subcategory:
            # Let the classification service derive the category from the new
            # subcategory. Otherwise a subcategory picked from another category
            # gets validated against the movement's previous category.
            next_category_id = None
        else:
            next_category_id = movement.category_id
        next_subcategory_id = (
            None
            if payload.clear_subcategory
            else (
                payload.subcategory_id
                if "subcategory_id" in fields
                else movement.subcategory_id
            )
        )
        try:
            classification = resolve_movement_classification(
                session,
                category_id=next_category_id,
                subcategory_id=next_subcategory_id,
            )
        except ClassificationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        movement.category_id = classification.category.id
        movement.subcategory_id = (
            classification.subcategory.id
            if classification.subcategory is not None
            else None
        )

    if "reviewed" in fields and payload.reviewed is not None:
        movement.reviewed = payload.reviewed
    if "accounting_date" in fields and payload.accounting_date is not None:
        movement.accounting_date = parse_action_date(payload.accounting_date)
    if "date" in fields and payload.date is not None:
        movement.date = parse_action_date(payload.date)
    if "amount" in fields and payload.amount is not None:
        movement.amount_cents = to_positive_cents(payload.amount)
    if "business" in fields and payload.business is not None:
        movement.business = payload.business
    if "reason" in fields and payload.reason is not None:
        movement.reason = payload.reason
    if "source" in fields and payload.source is not None:
        movement.source = payload.source
    if "raw_description" in fields:
        movement.raw_description = payload.raw_description
    if "source_file" in fields:
        movement.source_file = payload.source_file
    if "external_id" in fields:
        movement.external_id = payload.external_id
    if "source_row" in fields:
        movement.source_row = payload.source_row

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

    For every pending (``reviewed=false``) movement, look up its business in the
    memory built from ``reviewed=true`` movements. When the memory has a dominant
    subcategory, move the movement there but keep ``reviewed=false`` — it's a
    suggestion, not a confirmation, so the user still gets it in the review queue.
    """
    memory = build_classification_memory(session)
    if not memory:
        return ClassificationMemoryApplyResult(updated=0)
    lookup = memory_index(memory)

    candidates = session.exec(
        select(Movement).where(Movement.reviewed.is_(False))  # type: ignore[union-attr]
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
        try:
            classification = resolve_movement_classification(
                session,
                category_id=match.category_id,
                subcategory_id=match.subcategory_id,
            )
        except ClassificationError:
            continue
        movement.category_id = classification.category.id
        movement.subcategory_id = (
            classification.subcategory.id
            if classification.subcategory is not None
            else None
        )
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
