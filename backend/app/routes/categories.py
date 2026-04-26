"""CRUD endpoints for categories and subcategories."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.database import get_session
from app.models import Category, Movement, Subcategory, utcnow
from app.schemas import (
    ActionResult,
    CategoryCreate,
    CategoryMoveSubcategories,
    CategoryRead,
    CategoryUpdate,
    SubcategoryCreate,
    SubcategoryMoveMovements,
    SubcategoryRead,
    SubcategoryUpdate,
)
from app.utils import to_cents, to_pesos

router = APIRouter(prefix="/api", tags=["categories"])


def _serialize_category(category: Category, session: Session) -> CategoryRead:
    subcategories = sorted(category.subcategories, key=lambda sub: sub.name.lower())
    sub_reads: list[SubcategoryRead] = []
    total_movements = 0
    for sub in subcategories:
        count = session.exec(
            select(Movement).where(Movement.subcategory_id == sub.id)
        ).all()
        movement_count = len(count)
        total_movements += movement_count
        sub_reads.append(
            SubcategoryRead(
                id=sub.id,
                name=sub.name,
                budget=to_pesos(sub.budget) if sub.budget is not None else None,
                category_id=sub.category_id,
                movement_count=movement_count,
            )
        )
    return CategoryRead(
        id=category.id,
        name=category.name,
        kind=category.kind,
        budget=to_pesos(category.budget) if category.budget is not None else None,
        movement_count=total_movements,
        subcategories=sub_reads,
    )


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(session: Session = Depends(get_session)) -> list[CategoryRead]:
    categories = session.exec(
        select(Category).order_by(Category.kind, Category.name)
    ).all()
    return [_serialize_category(category, session) for category in categories]


@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    session: Session = Depends(get_session),
) -> CategoryRead:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")
    category = Category(
        name=name,
        kind=payload.kind,
        budget=to_cents(payload.budget) if payload.budget is not None else None,
    )
    session.add(category)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe otra categoría con ese nombre.",
        ) from exc
    session.refresh(category)
    return _serialize_category(category, session)


@router.patch("/categories/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    session: Session = Depends(get_session),
) -> CategoryRead:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")

    fields = payload.model_fields_set
    if "name" in fields:
        new_name = (payload.name or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")
        category.name = new_name
    if "budget" in fields:
        category.budget = to_cents(payload.budget) if payload.budget is not None else None

    category.updated_at = utcnow()
    session.add(category)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe otra categoría con ese nombre.",
        ) from exc
    session.refresh(category)
    return _serialize_category(category, session)


@router.delete("/categories/{category_id}", response_model=ActionResult)
def delete_category(
    category_id: str,
    session: Session = Depends(get_session),
) -> ActionResult:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")

    movement_count = session.exec(
        select(Movement)
        .join(Subcategory, Movement.subcategory_id == Subcategory.id)
        .where(Subcategory.category_id == category_id)
    ).all()
    if movement_count:
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar una categoría que tiene movimientos asociados.",
        )

    session.delete(category)
    session.commit()
    return ActionResult()


@router.post(
    "/categories/{category_id}/move-subcategories",
    response_model=ActionResult,
)
def move_category_subcategories(
    category_id: str,
    payload: CategoryMoveSubcategories,
    session: Session = Depends(get_session),
) -> ActionResult:
    if not payload.target_category_id:
        raise HTTPException(status_code=400, detail="Debes elegir una categoría de destino.")
    if payload.target_category_id == category_id:
        raise HTTPException(status_code=400, detail="Debes elegir otra categoría de destino.")

    source = session.get(Category, category_id)
    target = session.get(Category, payload.target_category_id)
    if source is None or target is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")

    source_subs = session.exec(
        select(Subcategory)
        .where(Subcategory.category_id == category_id)
        .order_by(Subcategory.created_at)
    ).all()

    for sub in source_subs:
        existing_target = session.exec(
            select(Subcategory).where(
                Subcategory.category_id == payload.target_category_id,
                Subcategory.name == sub.name,
            )
        ).first()
        if existing_target is not None:
            movements = session.exec(
                select(Movement).where(Movement.subcategory_id == sub.id)
            ).all()
            for movement in movements:
                movement.subcategory_id = existing_target.id
                movement.updated_at = utcnow()
                session.add(movement)
            session.delete(sub)
        else:
            sub.category_id = payload.target_category_id
            sub.updated_at = utcnow()
            session.add(sub)

    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se pudieron mover las subcategorías por un conflicto de nombres.",
        ) from exc
    return ActionResult()


# --------------------------------------------------------------------------- subcategories


@router.post(
    "/subcategories",
    response_model=SubcategoryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_subcategory(
    payload: SubcategoryCreate,
    session: Session = Depends(get_session),
) -> SubcategoryRead:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")
    parent = session.get(Category, payload.category_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="Categoría padre no encontrada.")
    sub = Subcategory(
        name=name,
        category_id=payload.category_id,
        budget=to_cents(payload.budget) if payload.budget is not None else None,
    )
    session.add(sub)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe otra subcategoría con ese nombre dentro de la categoría.",
        ) from exc
    session.refresh(sub)
    return SubcategoryRead(
        id=sub.id,
        name=sub.name,
        budget=to_pesos(sub.budget) if sub.budget is not None else None,
        category_id=sub.category_id,
        movement_count=0,
    )


@router.patch("/subcategories/{subcategory_id}", response_model=SubcategoryRead)
def update_subcategory(
    subcategory_id: str,
    payload: SubcategoryUpdate,
    session: Session = Depends(get_session),
) -> SubcategoryRead:
    sub = session.get(Subcategory, subcategory_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")

    fields = payload.model_fields_set
    if "name" in fields:
        new_name = (payload.name or "").strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")
        sub.name = new_name
    if "budget" in fields:
        sub.budget = to_cents(payload.budget) if payload.budget is not None else None

    sub.updated_at = utcnow()
    session.add(sub)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ya existe otra subcategoría con ese nombre.",
        ) from exc
    session.refresh(sub)

    movement_count = len(
        session.exec(select(Movement).where(Movement.subcategory_id == sub.id)).all()
    )
    return SubcategoryRead(
        id=sub.id,
        name=sub.name,
        budget=to_pesos(sub.budget) if sub.budget is not None else None,
        category_id=sub.category_id,
        movement_count=movement_count,
    )


@router.delete("/subcategories/{subcategory_id}", response_model=ActionResult)
def delete_subcategory(
    subcategory_id: str,
    session: Session = Depends(get_session),
) -> ActionResult:
    sub = session.get(Subcategory, subcategory_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")

    has_movements = session.exec(
        select(Movement).where(Movement.subcategory_id == subcategory_id)
    ).first()
    if has_movements is not None:
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar una subcategoría que tiene movimientos asociados.",
        )

    session.delete(sub)
    session.commit()
    return ActionResult()


@router.post(
    "/subcategories/{subcategory_id}/move-movements",
    response_model=ActionResult,
)
def move_subcategory_movements(
    subcategory_id: str,
    payload: SubcategoryMoveMovements,
    session: Session = Depends(get_session),
) -> ActionResult:
    if not payload.target_subcategory_id:
        raise HTTPException(status_code=400, detail="Debes elegir una subcategoría de destino.")
    if payload.target_subcategory_id == subcategory_id:
        raise HTTPException(status_code=400, detail="Debes elegir otra subcategoría de destino.")

    source = session.get(Subcategory, subcategory_id)
    target = session.get(Subcategory, payload.target_subcategory_id)
    if source is None or target is None:
        raise HTTPException(status_code=404, detail="Subcategoría no encontrada.")

    movements = session.exec(
        select(Movement).where(Movement.subcategory_id == subcategory_id)
    ).all()
    for movement in movements:
        movement.subcategory_id = payload.target_subcategory_id
        movement.updated_at = utcnow()
        session.add(movement)
    session.commit()
    return ActionResult()
