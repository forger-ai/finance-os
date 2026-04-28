"""Build a 'business → category[/subcategory]' memory from reviewed history.

Used by the LLM extractor (as few-shot examples), the deterministic CSV/XLSX
importer (default classification when the file has no classification columns),
and the bulk-apply endpoint that backfills already-pending movements.

The dominant entry per business now tracks both ``category_id`` and an
optional ``subcategory_id``: a category-only assignment is a valid
classification under the new model.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlmodel import Session, select

from app.models import Category, Movement, Subcategory
from app.utils import normalize_key


@dataclass
class MemoryEntry:
    business: str
    business_key: str
    category_id: str
    category_name: str
    subcategory_id: str | None
    subcategory_name: str | None
    count: int


def _classification_key(category_id: str, subcategory_id: str | None) -> str:
    return f"{category_id}|{subcategory_id or ''}"


def build_classification_memory(
    session: Session,
    *,
    limit: int | None = None,
    min_confidence: int = 1,
) -> list[MemoryEntry]:
    """Return ``business → classification`` examples from reviewed movements.

    Parameters:
        limit: Cap the result to the top-N most-frequent businesses.
        min_confidence: Skip a business when its dominant classification has
            fewer than this many occurrences. Useful when callers want to act
            automatically rather than just suggest.
    """
    reviewed = session.exec(
        select(Movement).where(Movement.reviewed.is_(True))  # type: ignore[union-attr]
    ).all()

    sub_lookup: dict[str, Subcategory] = {}
    cat_lookup: dict[str, Category] = {}

    business_counts: dict[str, int] = {}
    business_display: dict[str, str] = {}
    # business_key → classification_key → count
    business_class_counts: dict[str, dict[str, int]] = {}
    # classification_key → (category_id, subcategory_id|None) for quick decode
    class_decode: dict[str, tuple[str, str | None]] = {}

    for movement in reviewed:
        biz_key = normalize_key(movement.business or "")
        if not biz_key:
            continue
        business_display.setdefault(biz_key, movement.business)
        business_counts[biz_key] = business_counts.get(biz_key, 0) + 1
        class_key = _classification_key(movement.category_id, movement.subcategory_id)
        class_decode.setdefault(class_key, (movement.category_id, movement.subcategory_id))
        inner = business_class_counts.setdefault(biz_key, {})
        inner[class_key] = inner.get(class_key, 0) + 1

    entries: list[MemoryEntry] = []
    for biz_key, inner in business_class_counts.items():
        winning_key, winning_count = max(inner.items(), key=lambda kv: kv[1])
        if winning_count < min_confidence:
            continue
        cat_id, sub_id = class_decode[winning_key]

        cat = cat_lookup.get(cat_id) or session.get(Category, cat_id)
        if cat is None:
            continue
        cat_lookup[cat_id] = cat

        sub_name: str | None = None
        if sub_id is not None:
            sub = sub_lookup.get(sub_id) or session.get(Subcategory, sub_id)
            if sub is None:
                # Subcategory was deleted after a movement was classified;
                # fall back to category-only.
                sub_id = None
            else:
                sub_lookup[sub_id] = sub
                sub_name = sub.name

        entries.append(
            MemoryEntry(
                business=business_display[biz_key],
                business_key=biz_key,
                category_id=cat.id,
                category_name=cat.name,
                subcategory_id=sub_id,
                subcategory_name=sub_name,
                count=business_counts[biz_key],
            )
        )

    entries.sort(key=lambda e: e.count, reverse=True)
    if limit is not None:
        entries = entries[:limit]
    return entries


def memory_index(memory: list[MemoryEntry]) -> dict[str, MemoryEntry]:
    """Return a lookup keyed by ``business_key`` (normalized) for O(1) access."""
    return {entry.business_key: entry for entry in memory}
