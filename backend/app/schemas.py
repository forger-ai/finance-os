"""Pydantic schemas exposed by the API.

These are deliberately decoupled from the ``SQLModel`` table classes so that the
HTTP surface stays stable even if storage details change.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import CategoryKind, MovementSource

# --------------------------------------------------------------------------- helpers


class _Base(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


# --------------------------------------------------------------------------- categories


class SubcategoryRead(_Base):
    id: str
    name: str
    budget: float | None
    category_id: str
    movement_count: int = 0


class CategoryRead(_Base):
    id: str
    name: str
    kind: CategoryKind
    budget: float | None
    movement_count: int = 0
    subcategories: list[SubcategoryRead] = Field(default_factory=list)


class CategoryCreate(_Base):
    name: str
    kind: CategoryKind
    budget: float | None = None


class CategoryUpdate(_Base):
    name: str | None = None
    budget: float | None = None
    # Use a sentinel? Keep it simple: PATCH with explicit ``budget`` clears via ``null``
    # only if the field is in the JSON body. We rely on ``model_fields_set``.


class CategoryMoveSubcategories(_Base):
    target_category_id: str


class SubcategoryCreate(_Base):
    name: str
    category_id: str
    budget: float | None = None


class SubcategoryUpdate(_Base):
    name: str | None = None
    budget: float | None = None


class SubcategoryMoveMovements(_Base):
    target_subcategory_id: str


# --------------------------------------------------------------------------- movements


class MovementRead(_Base):
    id: str
    date: datetime
    accounting_date: datetime
    amount: float
    business: str
    reason: str
    source: MovementSource
    raw_description: str | None
    reviewed: bool
    subcategory_id: str
    subcategory_name: str
    category_id: str
    category_name: str
    category_kind: CategoryKind
    category_budget: float | None


class MovementUpdate(_Base):
    subcategory_id: str | None = None
    reviewed: bool | None = None
    accounting_date: str | None = Field(default=None, description="YYYY-MM-DD")
    date: str | None = Field(default=None, description="YYYY-MM-DD")
    amount: float | None = None
    business: str | None = None
    reason: str | None = None
    source: MovementSource | None = None
    raw_description: str | None = None


class MovementCreate(_Base):
    date: str = Field(description="YYYY-MM-DD or ISO 8601")
    accounting_date: str | None = Field(
        default=None, description="YYYY-MM-DD or ISO 8601, defaults to date"
    )
    amount: float
    business: str
    reason: str
    source: MovementSource = MovementSource.MANUAL
    raw_description: str | None = None
    reviewed: bool = False
    subcategory_id: str


# --------------------------------------------------------------------------- summary


class SummarySourceCounts(_Base):
    bank: int = 0
    credit_card: int = 0
    manual: int = 0


class SummaryRead(_Base):
    total: int
    reviewed: int
    sources: SummarySourceCounts


# --------------------------------------------------------------------------- imports


class ImportError(_Base):
    row: int
    error: str


class ImportResult(_Base):
    file: str
    inserted: int
    failed: int
    errors: list[ImportError] = Field(default_factory=list)


# --------------------------------------------------------------------------- generic


class ActionResult(_Base):
    ok: Literal[True] = True


class HealthRead(_Base):
    status: Literal["ok"] = "ok"
    database: str
