"""Helpers shared by routes, services and scripts."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone

UTC = timezone.utc


def to_pesos(amount_cents: int) -> float:
    """Convert internal integer cents to a float in pesos for the API surface."""
    return amount_cents / 100


def to_cents(value: str | float | int) -> int:
    """Convert a CSV/CLI/JSON value to integer cents.

    Accepts ``"1500"``, ``"1500,50"``, ``"1500.50"``, floats and ints.
    Rounds banker-style to the nearest cent.
    """
    if isinstance(value, int) and not isinstance(value, bool):
        return value * 100
    if isinstance(value, float):
        return int(round(value * 100))
    text = str(value).strip()
    if text == "":
        raise ValueError("Empty amount")
    # Normalize Chilean style "1.500,50" → "1500.50"
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    return int(round(float(text) * 100))


_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DMY = re.compile(r"^(\d{2})[/-](\d{2})[/-](\d{2}|\d{4})$")


def parse_date_input(value: str | datetime) -> datetime:
    """Parse common date formats into a UTC datetime at 00:00:00.

    Mirrors ``parseDateInput`` from the original Node ``_common.mjs``.
    Accepts ``YYYY-MM-DD``, ``DD/MM/YYYY``, ``DD-MM-YYYY``, ``DD/MM/YY`` plus
    arbitrary ISO 8601 strings.
    """
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    text = value.strip()
    if not text:
        raise ValueError(f"Invalid date value: {value!r}")

    if _ISO_DATE.match(text):
        return datetime.fromisoformat(f"{text}T00:00:00+00:00")

    match = _DMY.match(text)
    if match:
        day, month, year_raw = match.groups()
        year = f"20{year_raw}" if len(year_raw) == 2 else year_raw
        return datetime.fromisoformat(f"{year}-{month}-{day}T00:00:00+00:00")

    # Last-resort ISO parse, with Z normalization.
    iso_text = text.replace("Z", "+00:00") if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(iso_text)
    except ValueError as exc:
        raise ValueError(f"Invalid date value: {value!r}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def parse_action_date(value: str) -> datetime:
    """Parse a ``YYYY-MM-DD`` from a UI/API edit into a UTC datetime."""
    if not _ISO_DATE.match(value):
        raise ValueError(f"Expected YYYY-MM-DD, got {value!r}")
    return datetime.fromisoformat(f"{value}T00:00:00+00:00")


def parse_boolean(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes", "y"}:
        return True
    if normalized in {"false", "0", "no", "n"}:
        return False
    raise ValueError(f"Invalid boolean value: {value!r}")


def normalize_key(value: str) -> str:
    """Strip diacritics, lowercase and trim — matches the Node importer."""
    if value is None:
        return ""
    decomposed = unicodedata.normalize("NFD", value)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return stripped.strip().lower()


def normalize_text(value: str | None) -> str:
    return (value or "").strip().lower()


def isoformat_z(value: datetime) -> str:
    """Serialize a datetime as ISO 8601 with a trailing ``Z``."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    text = value.astimezone(UTC).isoformat()
    return text.replace("+00:00", "Z")
