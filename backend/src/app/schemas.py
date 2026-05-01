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
    category_id: str
    movement_count: int = 0


class CategoryRead(_Base):
    id: str
    name: str
    kind: CategoryKind
    movement_count: int = 0
    subcategories: list[SubcategoryRead] = Field(default_factory=list)


class CategoryCreate(_Base):
    name: str
    kind: CategoryKind


class CategoryUpdate(_Base):
    name: str | None = None


class CategoryMigrateMovements(_Base):
    target_category_id: str
    target_subcategory_id: str | None = None


class SubcategoryCreate(_Base):
    name: str
    category_id: str


class SubcategoryUpdate(_Base):
    name: str | None = None


class SubcategoryMoveMovements(_Base):
    target_category_id: str | None = None
    target_subcategory_id: str | None = None


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
    source_file: str | None = None
    external_id: str | None = None
    source_row: str | None = None
    import_hash: str | None = None
    duplicate_warning: str | None = None
    reviewed: bool
    category_id: str
    category_name: str
    category_kind: CategoryKind
    subcategory_id: str | None = None
    subcategory_name: str | None = None


# --------------------------------------------------------------------------- budgets


class CategoryBudgetRead(_Base):
    id: str
    budget_id: str
    category_id: str
    category_name: str
    amount: float


class SubcategoryBudgetRead(_Base):
    id: str
    budget_id: str
    subcategory_id: str
    subcategory_name: str
    category_id: str
    category_name: str
    amount: float


class BudgetRead(_Base):
    id: str
    month: int
    year: int
    label: str
    category_budgets: list[CategoryBudgetRead] = Field(default_factory=list)
    subcategory_budgets: list[SubcategoryBudgetRead] = Field(default_factory=list)


class BudgetCreate(_Base):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=1900, le=9999)


class BudgetUpdate(_Base):
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=1900, le=9999)


class CategoryBudgetCreate(_Base):
    category_id: str
    amount: float


class CategoryBudgetUpdate(_Base):
    category_id: str | None = None
    amount: float | None = None


class SubcategoryBudgetCreate(_Base):
    subcategory_id: str
    amount: float


class SubcategoryBudgetUpdate(_Base):
    subcategory_id: str | None = None
    amount: float | None = None


class MovementUpdate(_Base):
    category_id: str | None = None
    subcategory_id: str | None = None
    # Sentinel: when the client sends ``"clear_subcategory": true`` we strip the
    # subcategory regardless of what ``subcategory_id`` says, so the user can
    # demote a fully-classified movement to category-only.
    clear_subcategory: bool | None = None
    reviewed: bool | None = None
    accounting_date: str | None = Field(default=None, description="YYYY-MM-DD")
    date: str | None = Field(default=None, description="YYYY-MM-DD")
    amount: float | None = None
    business: str | None = None
    reason: str | None = None
    source: MovementSource | None = None
    raw_description: str | None = None
    source_file: str | None = None
    external_id: str | None = None
    source_row: str | None = None


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
    source_file: str | None = None
    external_id: str | None = None
    source_row: str | None = None
    reviewed: bool = False
    category_id: str
    subcategory_id: str | None = None


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
    duplicate: int = 0
    failed: int
    errors: list[ImportError] = Field(default_factory=list)


class PreprocessedDocumentRead(_Base):
    filename: str
    content_type: str
    kind: str
    text: str
    row_count: int | None = None
    page_count: int | None = None
    warning: str | None = None


# --------------------------------------------------------------------------- generic


class ActionResult(_Base):
    ok: Literal[True] = True


class HealthRead(_Base):
    status: Literal["ok"] = "ok"
    database: str
