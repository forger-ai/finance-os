"""CSV import service.

Mirrors the behavior of ``scripts/db/import-movements.mjs`` from the original
Next.js project:

- accepts the canonical English column names plus Spanish aliases
- skips rows whose ``(date, amount)`` pair already exists — catches duplicates
  even across formats (CSV + PDF + image)
- maps subcategory names case- and accent-insensitively
- inserts rows individually so a single bad row never blocks the rest
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime

from sqlmodel import Session, select

from app.models import Category, Movement, MovementSource, Subcategory
from app.services.bootstrap import UNCLASSIFIED_NAME, ensure_unclassified_subcategory
from app.services.classification import resolve_movement_classification
from app.services.classification_memory import (
    build_classification_memory,
    memory_index,
)
from app.utils import (
    normalize_key,
    parse_boolean,
    parse_date_input,
    to_cents,
    to_positive_cents,
)

# Field aliases. Includes the canonical English names plus common Chilean bank
# export columns. ``normalize_key`` strips diacritics and lowercases, so e.g.
# "Descripción" matches "descripcion".
_ALIASES: dict[str, list[str]] = {
    "date": ["date", "fecha", "fechamovimiento", "fecha movimiento"],
    "amount": ["amount", "monto", "valor", "importe"],
    "charge": ["cargo", "debito", "debe", "montocargo", "monto cargo"],
    "credit": ["abono", "credito", "haber", "montoabono", "monto abono"],
    "business": ["business", "buisness", "comercio", "merchant"],
    "reason": [
        "reason",
        "descripcion",
        "detalle",
        "glosa",
        "concepto",
        "operacion",
        "movimiento",
    ],
    "subcategory": ["subcategory", "subcategoria", "sub_category"],
    "source": ["source", "origen", "fuente"],
    "accounting_date": [
        "accountingdate",
        "accounting_date",
        "fecha contable",
        "fechacontable",
        "fechacargo",
        "fecha cargo",
    ],
    "raw_description": [
        "rawdescription",
        "raw_description",
        "descripcionoriginal",
        "detalleoriginal",
    ],
    "reviewed": ["reviewed", "revisado"],
}


@dataclass
class ImportRowError:
    row: int
    error: str


@dataclass
class ImportOutcome:
    file: str
    inserted: int
    failed: int
    errors: list[ImportRowError] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "file": self.file,
            "inserted": self.inserted,
            "failed": self.failed,
            "errors": [{"row": err.row, "error": err.error} for err in self.errors],
        }


_HEADER_PARENS = re.compile(r"\([^)]*\)")
_HEADER_WS = re.compile(r"\s+")


def _normalize_header(value: str) -> str:
    """Aggressively normalize a column header for alias matching.

    On top of ``normalize_key`` (lowercase + strip accents) we also drop
    parenthesized suffixes and currency markers — bank exports love things
    like ``Monto cargo ($)`` or ``Saldo (CLP)`` where the actual semantic
    label is just ``monto cargo`` / ``saldo``.
    """
    base = normalize_key(value)
    base = _HEADER_PARENS.sub("", base)
    base = base.replace("$", " ").replace("clp", " ")
    return _HEADER_WS.sub(" ", base).strip()


def _pick(record: dict[str, str], aliases: list[str]) -> str:
    normalized = {_normalize_header(key): value for key, value in record.items()}
    for alias in aliases:
        if alias in normalized:
            return normalized[alias]
    return ""


def _parse_optional_amount(text: str) -> int:
    """Convert a charge/credit cell to integer cents. Empty/zero → 0."""
    if not text or text.strip() in {"", "0", "0.0", "0,0", "-"}:
        return 0
    try:
        return abs(to_cents(text))
    except ValueError:
        return 0


def has_recognizable_schema(text: str) -> bool:
    """Cheap pre-check used by callers to reject ambiguous tabular layouts.

    True when the header row exposes both a date column and at least one of
    ``amount``/``cargo``/``abono``. Below that bar we can't even attempt a
    deterministic import.
    """
    records = parse_csv_text(text)
    if not records:
        return False
    headers = {_normalize_header(key) for key in records[0] if key != "__row"}
    has_date = any(alias in headers for alias in _ALIASES["date"])
    has_amount = any(
        alias in headers
        for alias in (
            _ALIASES["amount"] + _ALIASES["charge"] + _ALIASES["credit"]
        )
    )
    return has_date and has_amount


def _build_duplicate_key(*, amount_cents: int, date: datetime) -> str:
    """Identify duplicates by ``(day, amount)`` pair.

    Looser than full-row equality on purpose: lets us catch the same movement
    coming in via different formats (CSV header names, Codex-extracted PDF,
    screenshot OCR) where ``business`` and ``raw_description`` may differ even
    though the underlying transaction is the same.

    Trade-off: two genuinely distinct transactions with the same amount on the
    same day will collide. The user can add the second one manually if needed.
    """
    return f"{date.date().isoformat()}|{abs(amount_cents)}"


def parse_csv_text(text: str) -> list[dict[str, str]]:
    """Parse a CSV string into a list of records keyed by header.

    Skips blank rows. Adds ``__row`` for downstream error reporting (1-indexed,
    matching the Node implementation: header is row 1, first data row is 2).
    """
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() != "" for cell in row)]
    if not rows:
        return []

    headers = [header.strip() for header in rows[0]]
    records: list[dict[str, str]] = []
    for offset, values in enumerate(rows[1:]):
        record: dict[str, str] = {"__row": str(offset + 2)}
        for index, header in enumerate(headers):
            record[header] = (values[index] if index < len(values) else "").strip()
        records.append(record)
    return records


def import_movements_from_csv(
    session: Session,
    csv_text: str,
    *,
    file_label: str = "uploaded.csv",
) -> ImportOutcome:
    """Import movements from a CSV string into the database.

    Each successful row is committed individually so partial progress survives a
    later failure. Failures are accumulated and returned in the outcome.
    """
    records = parse_csv_text(csv_text)
    if not records:
        return ImportOutcome(file=file_label, inserted=0, failed=0)

    fallback_sub = ensure_unclassified_subcategory(session)
    fallback_category_id = fallback_sub.category_id

    subcategories = session.exec(select(Subcategory)).all()
    subcategory_map: dict[str, Subcategory] = {
        normalize_key(sub.name): sub for sub in subcategories
    }
    subcategory_by_id: dict[str, Subcategory] = {sub.id: sub for sub in subcategories}

    categories = session.exec(select(Category)).all()
    category_by_id: dict[str, Category] = {cat.id: cat for cat in categories}

    # Memory of past business → classification choices made by the user.
    memory_lookup = memory_index(build_classification_memory(session))

    existing_movements = session.exec(select(Movement)).all()
    known_keys: set[str] = {
        _build_duplicate_key(
            amount_cents=movement.amount_cents,
            date=movement.date,
        )
        for movement in existing_movements
    }

    inserted = 0
    errors: list[ImportRowError] = []

    for record in records:
        row_number = int(record.get("__row", "0"))
        try:
            date_text = _pick(record, _ALIASES["date"])
            amount_text = _pick(record, _ALIASES["amount"])
            charge_text = _pick(record, _ALIASES["charge"])
            credit_text = _pick(record, _ALIASES["credit"])
            business = _pick(record, _ALIASES["business"])
            reason = _pick(record, _ALIASES["reason"])
            subcategory_name = _pick(record, _ALIASES["subcategory"])
            source_text = _pick(record, _ALIASES["source"])
            accounting_date_text = _pick(record, _ALIASES["accounting_date"])
            raw_description = _pick(record, _ALIASES["raw_description"])
            reviewed_text = _pick(record, _ALIASES["reviewed"])

            if not date_text:
                raise ValueError("Falta la columna de fecha en esta fila.")

            # Movement amounts are stored as positive magnitudes. Direction is
            # represented by the resolved category kind, not by the sign.
            if amount_text:
                amount_cents = to_positive_cents(amount_text)
            else:
                charge_cents = _parse_optional_amount(charge_text)
                credit_cents = _parse_optional_amount(credit_text)
                if charge_cents == 0 and credit_cents == 0:
                    raise ValueError(
                        "Falta el monto: no encontré columnas amount/monto/cargo/abono "
                        "con valor."
                    )
                amount_cents = charge_cents or credit_cents

            # Reason / business defaults: bank exports rarely have ``business``
            # as a separate column, so we derive it from the description.
            reason_value = (reason or raw_description or "").strip()
            business_value = (business or reason_value or "—").strip()
            if not reason_value:
                reason_value = business_value

            # Classification resolution:
            #   1. Explicit subcategory column in the file → derive category from sub.
            #   2. Memory match for this business → copy its category (and sub if any).
            #   3. Fallback to the bootstrap "Sin clasificar" category.
            sub: Subcategory | None
            category_id: str
            if subcategory_name:
                resolved_sub = subcategory_map.get(normalize_key(subcategory_name))
                if resolved_sub is None:
                    raise ValueError(
                        f"Subcategoría desconocida: {subcategory_name}"
                    )
                sub = resolved_sub
                category_id = resolved_sub.category_id
            else:
                memory_match = memory_lookup.get(normalize_key(business_value))
                if memory_match is not None and memory_match.category_id in category_by_id:
                    category_id = memory_match.category_id
                    sub = (
                        subcategory_by_id.get(memory_match.subcategory_id)
                        if memory_match.subcategory_id is not None
                        else None
                    )
                else:
                    category_id = fallback_category_id
                    sub = fallback_sub

            raw_date = parse_date_input(date_text)
            accounting_date = (
                parse_date_input(accounting_date_text) if accounting_date_text else raw_date
            )
            normalized_source_text = (source_text or "MANUAL").upper()
            try:
                normalized_source = MovementSource(normalized_source_text)
            except ValueError as exc:
                raise ValueError(f"Origen desconocido: {source_text}") from exc

            duplicate_key = _build_duplicate_key(
                amount_cents=amount_cents,
                date=raw_date,
            )
            if duplicate_key in known_keys:
                raise ValueError("Ya existe un movimiento con esta fecha y monto.")

            # ``Sin clasificar`` rows always start unreviewed regardless of the
            # ``reviewed`` cell, so the user is forced to confirm them. Any
            # category/subcategory whose name matches the placeholder qualifies.
            unclassified = normalize_key(UNCLASSIFIED_NAME)
            category_name = (
                category_by_id[category_id].name if category_id in category_by_id else ""
            )
            is_unclassified = (
                normalize_key(category_name) == unclassified
                or (sub is not None and normalize_key(sub.name) == unclassified)
            )
            classification = resolve_movement_classification(
                session,
                category_id=category_id,
                subcategory_id=sub.id if sub is not None else None,
            )
            initial_reviewed = (
                False
                if is_unclassified
                else (parse_boolean(reviewed_text) if reviewed_text != "" else False)
            )

            movement = Movement(
                date=raw_date,
                accounting_date=accounting_date,
                amount_cents=amount_cents,
                business=business_value,
                reason=reason_value,
                source=normalized_source,
                raw_description=raw_description or None,
                reviewed=initial_reviewed,
                category_id=classification.category.id,
                subcategory_id=classification.subcategory.id
                if classification.subcategory is not None
                else None,
            )
            session.add(movement)
            session.commit()
            session.refresh(movement)
            known_keys.add(duplicate_key)
            inserted += 1
        except Exception as exc:  # noqa: BLE001 - we want to surface every error to the caller
            session.rollback()
            errors.append(ImportRowError(row=row_number, error=str(exc)))

    return ImportOutcome(
        file=file_label,
        inserted=inserted,
        failed=len(errors),
        errors=errors,
    )
