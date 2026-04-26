"""CSV import service.

Mirrors the behavior of ``scripts/db/import-movements.mjs`` from the original
Next.js project:

- accepts the canonical English column names plus Spanish aliases
- detects probable duplicates using raw date + amount + business + reason +
  source + raw description
- maps subcategory names case- and accent-insensitively
- inserts rows individually so a single bad row never blocks the rest
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from datetime import datetime

from sqlmodel import Session, select

from app.models import Movement, MovementSource, Subcategory
from app.utils import (
    normalize_key,
    normalize_text,
    parse_boolean,
    parse_date_input,
    to_cents,
)

# Field aliases mirror the Node importer's ``pick`` helper.
_ALIASES: dict[str, list[str]] = {
    "date": ["date", "fecha"],
    "amount": ["amount", "monto"],
    "business": ["business", "buisness", "comercio"],
    "reason": ["reason", "descripcion", "detalle", "glosa"],
    "subcategory": ["subcategory", "subcategoria", "sub_category"],
    "source": ["source", "origen", "fuente"],
    "accounting_date": ["accountingdate", "accounting_date", "fecha contable", "fechacontable"],
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


def _pick(record: dict[str, str], aliases: list[str]) -> str:
    normalized = {normalize_key(key): value for key, value in record.items()}
    for alias in aliases:
        if alias in normalized:
            return normalized[alias]
    return ""


def _build_duplicate_key(
    *,
    amount_cents: int,
    business: str,
    date: datetime,
    raw_description: str | None,
    reason: str,
    source: MovementSource,
) -> str:
    return json.dumps(
        {
            "amount_cents": amount_cents,
            "business": normalize_text(business),
            "date": date.isoformat(),
            "rawDescription": normalize_text(raw_description),
            "reason": normalize_text(reason),
            "source": source.value,
        },
        sort_keys=True,
    )


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

    subcategories = session.exec(select(Subcategory)).all()
    subcategory_map: dict[str, Subcategory] = {
        normalize_key(sub.name): sub for sub in subcategories
    }

    existing_movements = session.exec(select(Movement)).all()
    known_keys: set[str] = {
        _build_duplicate_key(
            amount_cents=movement.amount_cents,
            business=movement.business,
            date=movement.date,
            raw_description=movement.raw_description,
            reason=movement.reason,
            source=movement.source,
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
            business = _pick(record, _ALIASES["business"])
            reason = _pick(record, _ALIASES["reason"])
            subcategory_name = _pick(record, _ALIASES["subcategory"])
            source_text = _pick(record, _ALIASES["source"])
            accounting_date_text = _pick(record, _ALIASES["accounting_date"])
            raw_description = _pick(record, _ALIASES["raw_description"])
            reviewed_text = _pick(record, _ALIASES["reviewed"])

            if not (date_text and amount_text and business and reason and subcategory_name):
                raise ValueError(
                    "Missing one of required columns: date, amount, business, "
                    "reason, subcategory"
                )

            sub = subcategory_map.get(normalize_key(subcategory_name))
            if sub is None:
                raise ValueError(f"Unknown subcategory: {subcategory_name}")

            raw_date = parse_date_input(date_text)
            accounting_date = (
                parse_date_input(accounting_date_text) if accounting_date_text else raw_date
            )
            normalized_source_text = (source_text or "MANUAL").upper()
            try:
                normalized_source = MovementSource(normalized_source_text)
            except ValueError as exc:
                raise ValueError(f"Unknown source: {source_text}") from exc

            amount_cents = to_cents(amount_text)
            duplicate_key = _build_duplicate_key(
                amount_cents=amount_cents,
                business=business,
                date=raw_date,
                raw_description=raw_description or None,
                reason=reason,
                source=normalized_source,
            )
            if duplicate_key in known_keys:
                raise ValueError(
                    "Possible duplicate detected using raw date, amount, business, "
                    "reason, source and raw description"
                )

            movement = Movement(
                date=raw_date,
                accounting_date=accounting_date,
                amount_cents=amount_cents,
                business=business,
                reason=reason,
                source=normalized_source,
                raw_description=raw_description or None,
                reviewed=parse_boolean(reviewed_text) if reviewed_text != "" else False,
                subcategory_id=sub.id,
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
