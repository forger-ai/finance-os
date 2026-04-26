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
    # Stored as integer pesos. ``None`` means "no budget defined".
    budget: int | None = Field(default=None)
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
    budget: int | None = Field(default=None)
    category_id: str = Field(foreign_key="category.id", ondelete="CASCADE")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    category: "Category" = Relationship(back_populates="subcategories")
    movements: list["Movement"] = Relationship(back_populates="subcategory")


class Movement(SQLModel, table=True):
    __tablename__ = "movement"
    __table_args__ = (
        Index("ix_movement_date", "date"),
        Index("ix_movement_accounting_date", "accounting_date"),
        Index("ix_movement_subcategory_date", "subcategory_id", "date"),
        Index("ix_movement_subcategory_accounting_date", "subcategory_id", "accounting_date"),
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
    reviewed: bool = Field(default=False)
    subcategory_id: str = Field(foreign_key="subcategory.id", ondelete="RESTRICT")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    subcategory: "Subcategory" = Relationship(back_populates="movements")
