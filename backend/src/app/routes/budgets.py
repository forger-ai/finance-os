"""CRUD endpoints for period budgets."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.database import get_session
from app.models import (
    Budget,
    Category,
    CategoryBudget,
    Subcategory,
    SubcategoryBudget,
    utcnow,
)
from app.schemas import (
    ActionResult,
    BudgetCreate,
    BudgetRead,
    BudgetUpdate,
    CategoryBudgetCreate,
    CategoryBudgetRead,
    CategoryBudgetUpdate,
    SubcategoryBudgetCreate,
    SubcategoryBudgetRead,
    SubcategoryBudgetUpdate,
)
from app.utils import to_cents, to_pesos

router = APIRouter(prefix="/api", tags=["budgets"])


def _period_label(month: int, year: int) -> str:
    return f"{year:04d}-{month:02d}"


def _serialize_budget(budget: Budget, session: Session) -> BudgetRead:
    category_rows = session.exec(
        select(CategoryBudget).where(CategoryBudget.budget_id == budget.id)
    ).all()
    subcategory_rows = session.exec(
        select(SubcategoryBudget).where(SubcategoryBudget.budget_id == budget.id)
    ).all()

    category_reads: list[CategoryBudgetRead] = []
    for row in category_rows:
        category = session.get(Category, row.category_id)
        if category is None:
            continue
        category_reads.append(
            CategoryBudgetRead(
                id=row.id,
                budget_id=row.budget_id,
                category_id=category.id,
                category_name=category.name,
                amount=to_pesos(row.amount_cents),
            )
        )

    subcategory_reads: list[SubcategoryBudgetRead] = []
    for row in subcategory_rows:
        subcategory = session.get(Subcategory, row.subcategory_id)
        if subcategory is None:
            continue
        category = session.get(Category, subcategory.category_id)
        if category is None:
            continue
        subcategory_reads.append(
            SubcategoryBudgetRead(
                id=row.id,
                budget_id=row.budget_id,
                subcategory_id=subcategory.id,
                subcategory_name=subcategory.name,
                category_id=category.id,
                category_name=category.name,
                amount=to_pesos(row.amount_cents),
            )
        )

    category_reads.sort(key=lambda item: item.category_name.lower())
    subcategory_reads.sort(
        key=lambda item: (item.category_name.lower(), item.subcategory_name.lower())
    )
    return BudgetRead(
        id=budget.id,
        month=budget.month,
        year=budget.year,
        label=_period_label(budget.month, budget.year),
        category_budgets=category_reads,
        subcategory_budgets=subcategory_reads,
    )


def _get_budget_or_404(session: Session, budget_id: str) -> Budget:
    budget = session.get(Budget, budget_id)
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget no encontrado.")
    return budget


@router.get("/budgets", response_model=list[BudgetRead])
def list_budgets(session: Session = Depends(get_session)) -> list[BudgetRead]:
    budgets = session.exec(
        select(Budget).order_by(text("year DESC"), text("month DESC"))
    ).all()
    return [_serialize_budget(budget, session) for budget in budgets]


@router.post("/budgets", response_model=BudgetRead, status_code=status.HTTP_201_CREATED)
def create_budget(payload: BudgetCreate, session: Session = Depends(get_session)) -> BudgetRead:
    budget = Budget(month=payload.month, year=payload.year)
    session.add(budget)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe un budget para ese periodo.",
        ) from exc
    session.refresh(budget)
    return _serialize_budget(budget, session)


@router.get("/budgets/{budget_id}", response_model=BudgetRead)
def get_budget(budget_id: str, session: Session = Depends(get_session)) -> BudgetRead:
    return _serialize_budget(_get_budget_or_404(session, budget_id), session)


@router.patch("/budgets/{budget_id}", response_model=BudgetRead)
def update_budget(
    budget_id: str,
    payload: BudgetUpdate,
    session: Session = Depends(get_session),
) -> BudgetRead:
    budget = _get_budget_or_404(session, budget_id)
    fields = payload.model_fields_set
    if "month" in fields and payload.month is not None:
        budget.month = payload.month
    if "year" in fields and payload.year is not None:
        budget.year = payload.year
    budget.updated_at = utcnow()
    session.add(budget)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe otro budget para ese periodo.",
        ) from exc
    session.refresh(budget)
    return _serialize_budget(budget, session)


@router.delete("/budgets/{budget_id}", response_model=ActionResult)
def delete_budget(budget_id: str, session: Session = Depends(get_session)) -> ActionResult:
    budget = _get_budget_or_404(session, budget_id)
    session.delete(budget)
    session.commit()
    return ActionResult()


@router.post(
    "/budgets/{budget_id}/category-budgets",
    response_model=CategoryBudgetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_category_budget(
    budget_id: str,
    payload: CategoryBudgetCreate,
    session: Session = Depends(get_session),
) -> CategoryBudgetRead:
    budget = _get_budget_or_404(session, budget_id)
    category = session.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    row = CategoryBudget(
        budget_id=budget.id,
        category_id=category.id,
        amount_cents=to_cents(payload.amount),
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ese budget de categoría ya existe.") from exc
    session.refresh(row)
    return CategoryBudgetRead(
        id=row.id,
        budget_id=row.budget_id,
        category_id=category.id,
        category_name=category.name,
        amount=to_pesos(row.amount_cents),
    )


@router.patch("/category-budgets/{row_id}", response_model=CategoryBudgetRead)
def update_category_budget(
    row_id: str,
    payload: CategoryBudgetUpdate,
    session: Session = Depends(get_session),
) -> CategoryBudgetRead:
    row = session.get(CategoryBudget, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Budget de categoría no encontrado.")
    category = session.get(Category, payload.category_id or row.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    row.category_id = category.id
    if "amount" in payload.model_fields_set and payload.amount is not None:
        row.amount_cents = to_cents(payload.amount)
    row.updated_at = utcnow()
    session.add(row)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Ese budget de categoría ya existe.") from exc
    session.refresh(row)
    return CategoryBudgetRead(
        id=row.id,
        budget_id=row.budget_id,
        category_id=category.id,
        category_name=category.name,
        amount=to_pesos(row.amount_cents),
    )


@router.delete("/category-budgets/{row_id}", response_model=ActionResult)
def delete_category_budget(row_id: str, session: Session = Depends(get_session)) -> ActionResult:
    row = session.get(CategoryBudget, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Budget de categoría no encontrado.")
    session.delete(row)
    session.commit()
    return ActionResult()


@router.post(
    "/budgets/{budget_id}/subcategory-budgets",
    response_model=SubcategoryBudgetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_subcategory_budget(
    budget_id: str,
    payload: SubcategoryBudgetCreate,
    session: Session = Depends(get_session),
) -> SubcategoryBudgetRead:
    budget = _get_budget_or_404(session, budget_id)
    subcategory = session.get(Subcategory, payload.subcategory_id)
    if subcategory is None:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")
    category = session.get(Category, subcategory.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    row = SubcategoryBudget(
        budget_id=budget.id,
        subcategory_id=subcategory.id,
        amount_cents=to_cents(payload.amount),
    )
    session.add(row)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ese budget de subcategoría ya existe.",
        ) from exc
    session.refresh(row)
    return SubcategoryBudgetRead(
        id=row.id,
        budget_id=row.budget_id,
        subcategory_id=subcategory.id,
        subcategory_name=subcategory.name,
        category_id=category.id,
        category_name=category.name,
        amount=to_pesos(row.amount_cents),
    )


@router.patch("/subcategory-budgets/{row_id}", response_model=SubcategoryBudgetRead)
def update_subcategory_budget(
    row_id: str,
    payload: SubcategoryBudgetUpdate,
    session: Session = Depends(get_session),
) -> SubcategoryBudgetRead:
    row = session.get(SubcategoryBudget, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Budget de subcategoría no encontrado.")
    subcategory = session.get(Subcategory, payload.subcategory_id or row.subcategory_id)
    if subcategory is None:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")
    category = session.get(Category, subcategory.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    row.subcategory_id = subcategory.id
    if "amount" in payload.model_fields_set and payload.amount is not None:
        row.amount_cents = to_cents(payload.amount)
    row.updated_at = utcnow()
    session.add(row)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ese budget de subcategoría ya existe.",
        ) from exc
    session.refresh(row)
    return SubcategoryBudgetRead(
        id=row.id,
        budget_id=row.budget_id,
        subcategory_id=subcategory.id,
        subcategory_name=subcategory.name,
        category_id=category.id,
        category_name=category.name,
        amount=to_pesos(row.amount_cents),
    )


@router.delete("/subcategory-budgets/{row_id}", response_model=ActionResult)
def delete_subcategory_budget(
    row_id: str,
    session: Session = Depends(get_session),
) -> ActionResult:
    row = session.get(SubcategoryBudget, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Budget de subcategoría no encontrado.")
    session.delete(row)
    session.commit()
    return ActionResult()
