"""SQLModel definitions for FinanceOS Lite.

Mirrors the original Prisma schema but with a few key differences:

- IDs are 25-char CUID-like strings generated in Python (no DB extension required).
- Money is stored as integer cents to avoid floating-point drift in SQLite.
- Datetimes are timezone-aware UTC for raw and accounting dates; we store in UTC
  and serialize as ISO 8601 with the trailing ``Z``.
"""

import secrets
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Index, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

UTC = timezone.utc

if TYPE_CHECKING:  # pragma: no cover
    pass


class CategoryKind(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    UNCHARGEABLE = "UNCHARGEABLE"


class MovementSource(str, Enum):
    BANK = "BANK"
    CREDIT_CARD = "CREDIT_CARD"
    MANUAL = "MANUAL"


def generate_id() -> str:
    """Generate a short, URL-safe identifier similar in spirit to Prisma's CUIDs.

    25 characters of base32 lowercase letters and digits — collision risk is
    negligible at the scales of a personal finance database.
    """
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(25))


def utcnow() -> datetime:
    return datetime.now(UTC)


class Category(SQLModel, table=True):
    __tablename__ = "category"
    __table_args__ = (UniqueConstraint("name", "kind", name="uq_category_name_kind"),)

    id: str = Field(default_factory=generate_id, primary_key=True)
    name: str
    kind: CategoryKind
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    subcategories: list["Subcategory"] = Relationship(
        back_populates="category",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Subcategory(SQLModel, table=True):
    __tablename__ = "subcategory"
    __table_args__ = (
        UniqueConstraint("category_id", "name", name="uq_subcategory_category_name"),
        Index("ix_subcategory_category_id", "category_id"),
    )

    id: str = Field(default_factory=generate_id, primary_key=True)
    name: str
    category_id: str = Field(foreign_key="category.id", ondelete="CASCADE")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    category: "Category" = Relationship(back_populates="subcategories")
    movements: list["Movement"] = Relationship(back_populates="subcategory")


class Budget(SQLModel, table=True):
    __tablename__ = "budget"
    __table_args__ = (UniqueConstraint("month", "year", name="uq_budget_period"),)

    id: str = Field(default_factory=generate_id, primary_key=True)
    month: int = Field(index=True)
    year: int = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    category_budgets: list["CategoryBudget"] = Relationship(
        back_populates="budget",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    subcategory_budgets: list["SubcategoryBudget"] = Relationship(
        back_populates="budget",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class CategoryBudget(SQLModel, table=True):
    __tablename__ = "category_budget"
    __table_args__ = (
        UniqueConstraint("budget_id", "category_id", name="uq_category_budget_period_category"),
        Index("ix_category_budget_budget_id", "budget_id"),
        Index("ix_category_budget_category_id", "category_id"),
    )

    id: str = Field(default_factory=generate_id, primary_key=True)
    budget_id: str = Field(foreign_key="budget.id", ondelete="CASCADE")
    category_id: str = Field(foreign_key="category.id", ondelete="CASCADE")
    amount_cents: int
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    budget: Budget = Relationship(back_populates="category_budgets")
    category: Category = Relationship()


class SubcategoryBudget(SQLModel, table=True):
    __tablename__ = "subcategory_budget"
    __table_args__ = (
        UniqueConstraint(
            "budget_id",
            "subcategory_id",
            name="uq_subcategory_budget_period_subcategory",
        ),
        Index("ix_subcategory_budget_budget_id", "budget_id"),
        Index("ix_subcategory_budget_subcategory_id", "subcategory_id"),
    )

    id: str = Field(default_factory=generate_id, primary_key=True)
    budget_id: str = Field(foreign_key="budget.id", ondelete="CASCADE")
    subcategory_id: str = Field(foreign_key="subcategory.id", ondelete="CASCADE")
    amount_cents: int
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    budget: Budget = Relationship(back_populates="subcategory_budgets")
    subcategory: Subcategory = Relationship()


class Setting(SQLModel, table=True):
    """Key-value app settings persisted in the database.

    Keys are namespaced strings. Values are stored as text; callers
    serialize/deserialize app-specific preferences.
    """

    __tablename__ = "setting"

    key: str = Field(primary_key=True)
    value: str | None = Field(default=None)
    updated_at: datetime = Field(default_factory=utcnow)


class Movement(SQLModel, table=True):
    __tablename__ = "movement"
    __table_args__ = (
        Index("ix_movement_date", "date"),
        Index("ix_movement_accounting_date", "accounting_date"),
        Index("ix_movement_category_date", "category_id", "date"),
        Index("ix_movement_subcategory_date", "subcategory_id", "date"),
        Index("ix_movement_import_hash", "import_hash", unique=True),
    )

    id: str = Field(default_factory=generate_id, primary_key=True)
    date: datetime
    accounting_date: datetime
    # Money in pesos, stored as integer cents (×100) to keep arithmetic exact.
    amount_cents: int
    business: str
    reason: str
    source: MovementSource
    raw_description: str | None = Field(default=None)
    source_file: str | None = Field(default=None)
    external_id: str | None = Field(default=None)
    source_row: str | None = Field(default=None)
    import_hash: str | None = Field(default=None)
    duplicate_warning: str | None = Field(default=None)
    reviewed: bool = Field(default=False)
    # ``category_id`` is the source of truth for classification — every movement
    # belongs to a category. ``subcategory_id`` is optional: when present its
    # ``category_id`` must match the movement's, but a category without
    # subcategories can still hold movements directly.
    category_id: str = Field(foreign_key="category.id", ondelete="RESTRICT")
    subcategory_id: str | None = Field(
        default=None, foreign_key="subcategory.id", ondelete="RESTRICT"
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    category: "Category" = Relationship()
    subcategory: "Subcategory" = Relationship(back_populates="movements")
