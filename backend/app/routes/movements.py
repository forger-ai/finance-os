"""Endpoints for movements: list, create, update, delete and the dashboard summary."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

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
from app.utils import parse_action_date, parse_date_input, to_cents, to_pesos

router = APIRouter(prefix="/api", tags=["movements"])


def _serialize_movement(movement: Movement) -> MovementRead:
    sub = movement.subcategory
    category = sub.category
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
        subcategory_id=sub.id,
        subcategory_name=sub.name,
        category_id=category.id,
        category_name=category.name,
        category_kind=category.kind,
        category_budget=to_pesos(category.budget) if category.budget is not None else None,
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
    sub = session.get(Subcategory, payload.subcategory_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")
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
        subcategory_id=payload.subcategory_id,
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
    if "subcategory_id" in fields and payload.subcategory_id is not None:
        sub = session.get(Subcategory, payload.subcategory_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")
        movement.subcategory_id = payload.subcategory_id
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
