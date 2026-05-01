"""Movement import services.

The CSV importer remains for local CSV/XLSX uploads. Assistant-operated imports
should prefer the structured JSON batch path because it avoids header, quoting,
and locale parsing ambiguity.

- accepts the canonical English column names plus Spanish aliases for CSV
- skips duplicates with a stable hash built from source, date, amount, and
  normalized description fields
- maps subcategory names case- and accent-insensitively
- inserts rows individually so a single bad row never blocks the rest
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from sqlmodel import Session, select

from app.models import Category, Movement, MovementSource, Subcategory
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
class ImportRowStatus:
    row: int
    status: Literal["inserted", "duplicate", "failed"]
    movement_id: str | None = None
    duplicate_of: str | None = None
    error: str | None = None


@dataclass
class ImportOutcome:
    file: str
    inserted: int
    duplicate: int = 0
    failed: int = 0
    errors: list[ImportRowError] = field(default_factory=list)
    rows: list[ImportRowStatus] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "file": self.file,
            "inserted": self.inserted,
            "duplicate": self.duplicate,
            "failed": self.failed,
            "errors": [{"row": err.row, "error": err.error} for err in self.errors],
            "rows": [
                {
                    key: value
                    for key, value in {
                        "row": row.row,
                        "status": row.status,
                        "movement_id": row.movement_id,
                        "duplicate_of": row.duplicate_of,
                        "error": row.error,
                    }.items()
                    if value is not None
                }
                for row in self.rows
            ],
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


def _normalize_description(value: str | None) -> str:
    normalized = normalize_key(value or "")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _fingerprint_payload(
    *,
    source_file: str,
    external_id: str | None,
    source_row: str | None,
    date: datetime,
    amount_cents: int,
    business: str,
    reason: str,
    raw_description: str | None,
) -> str | None:
    if external_id and external_id.strip():
        key = f"external|{_normalize_description(source_file)}|{external_id.strip()}"
    elif source_row and source_row.strip():
        key = f"row|{_normalize_description(source_file)}|{source_row.strip()}"
    else:
        return None
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _similarity_key(
    *,
    date: datetime,
    amount_cents: int,
    business: str,
    reason: str,
    raw_description: str | None,
) -> str:
    description = raw_description or reason or business
    return "|".join(
        [
            date.date().isoformat(),
            str(abs(amount_cents)),
            _normalize_description(description),
            _normalize_description(business),
        ]
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


def _existing_duplicate_maps(session: Session) -> tuple[dict[str, str], dict[str, str]]:
    by_hash: dict[str, str] = {}
    by_similarity: dict[str, str] = {}
    existing_movements = session.exec(select(Movement)).all()
    for movement in existing_movements:
        if movement.import_hash:
            by_hash[movement.import_hash] = movement.id
        by_similarity[
            _similarity_key(
                date=movement.date,
                amount_cents=movement.amount_cents,
                business=movement.business,
                reason=movement.reason,
                raw_description=movement.raw_description,
            )
        ] = movement.id
    return by_hash, by_similarity


def _category_maps(
    session: Session,
) -> tuple[
    dict[str, Category],
    dict[tuple[str, str], Category],
    dict[str, Subcategory],
    dict[tuple[str, str], Subcategory],
]:
    categories = session.exec(select(Category)).all()
    subcategories = session.exec(select(Subcategory)).all()
    category_by_id = {category.id: category for category in categories}
    category_by_name_kind = {
        (normalize_key(category.name), category.kind.value): category
        for category in categories
    }
    subcategory_by_id = {subcategory.id: subcategory for subcategory in subcategories}
    subcategory_by_category_name = {
        (subcategory.category_id, normalize_key(subcategory.name)): subcategory
        for subcategory in subcategories
    }
    return (
        category_by_id,
        category_by_name_kind,
        subcategory_by_id,
        subcategory_by_category_name,
    )


def _string_value(item: dict[str, Any], name: str, default: str = "") -> str:
    value = item.get(name)
    if value is None:
        return default
    return str(value).strip()


def _bool_value(item: dict[str, Any], name: str, default: bool = False) -> bool:
    value = item.get(name)
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return parse_boolean(str(value))


def _source_value(value: object) -> MovementSource:
    text = str(value or "MANUAL").strip().upper()
    try:
        return MovementSource(text)
    except ValueError as exc:
        raise ValueError(f"Unknown source: {value}") from exc


def _fallback_category(session: Session) -> Category:
    category = session.exec(select(Category).order_by(Category.created_at)).first()
    if category is None:
        raise ValueError("At least one category is required before importing movements.")
    return category


def _resolve_structured_classification(
    *,
    session: Session,
    item: dict[str, Any],
    category_by_id: dict[str, Category],
    category_by_name_kind: dict[tuple[str, str], Category],
    subcategory_by_id: dict[str, Subcategory],
    subcategory_by_category_name: dict[tuple[str, str], Subcategory],
) -> tuple[Category, Subcategory | None]:
    subcategory_id = _string_value(item, "subcategory_id")
    if subcategory_id:
        subcategory = subcategory_by_id.get(subcategory_id)
        if subcategory is None:
            raise ValueError(f"Unknown subcategory_id: {subcategory_id}")
        category = category_by_id.get(subcategory.category_id)
        if category is None:
            raise ValueError("Subcategory parent category was not found.")
        return category, subcategory

    category_id = _string_value(item, "category_id")
    category_name = _string_value(item, "category")
    category_kind = _string_value(item, "category_kind", "EXPENSE").upper()
    subcategory_name = _string_value(item, "subcategory")

    category: Category | None = None
    if category_id:
        category = category_by_id.get(category_id)
        if category is None:
            raise ValueError(f"Unknown category_id: {category_id}")
    elif category_name:
        category = category_by_name_kind.get((normalize_key(category_name), category_kind))
        if category is None:
            # If the name is unique, accept it even when the agent omitted kind.
            matches = [
                candidate
                for (name, _kind), candidate in category_by_name_kind.items()
                if name == normalize_key(category_name)
            ]
            if len(matches) == 1:
                category = matches[0]
        if category is None:
            raise ValueError(f"Unknown category: {category_name}")
    elif subcategory_name:
        matches = [
            sub
            for (_category_id, name), sub in subcategory_by_category_name.items()
            if name == normalize_key(subcategory_name)
        ]
        if len(matches) == 1:
            subcategory = matches[0]
            category = category_by_id.get(subcategory.category_id)
            if category is None:
                raise ValueError("Subcategory parent category was not found.")
            return category, subcategory
        if len(matches) > 1:
            raise ValueError(f"Ambiguous subcategory: {subcategory_name}")

    if category is None:
        return _fallback_category(session), None

    if subcategory_name:
        subcategory = subcategory_by_category_name.get(
            (category.id, normalize_key(subcategory_name))
        )
        if subcategory is None:
            raise ValueError(
                f"Unknown subcategory '{subcategory_name}' in category '{category.name}'"
            )
        return category, subcategory

    return category, None


def import_movements_structured(
    session: Session,
    movements: list[dict[str, Any]],
    *,
    file_label: str = "assistant-import",
) -> ImportOutcome:
    """Import a structured movement batch produced by the assistant.

    Duplicates are reported separately from failures. A duplicate is an already
    imported row with the same stable hash or, for legacy rows that do not have
    hashes yet, the same source/date/amount/normalized-description key.
    """
    if not movements:
        return ImportOutcome(file=file_label, inserted=0)

    (
        category_by_id,
        category_by_name_kind,
        subcategory_by_id,
        subcategory_by_category_name,
    ) = _category_maps(session)
    known_hashes, known_similar = _existing_duplicate_maps(session)

    inserted = 0
    duplicate = 0
    errors: list[ImportRowError] = []
    rows: list[ImportRowStatus] = []

    for index, item in enumerate(movements, start=1):
        row_number = int(item.get("_row_number", index))
        try:
            date_text = _string_value(item, "date")
            if not date_text:
                raise ValueError("Missing date.")
            raw_date = parse_date_input(date_text)
            accounting_date_text = _string_value(item, "accounting_date")
            accounting_date = (
                parse_date_input(accounting_date_text) if accounting_date_text else raw_date
            )
            if "amount" not in item:
                raise ValueError("Missing amount.")
            amount_cents = to_positive_cents(item["amount"])
            reason = _string_value(item, "reason") or _string_value(item, "description")
            raw_description = _string_value(item, "raw_description") or reason
            business = _string_value(item, "business") or reason or raw_description or "—"
            if not reason:
                reason = business
            source_file = _string_value(item, "source_file", file_label) or file_label
            external_id = _string_value(item, "external_id") or None
            source_row = (
                _string_value(item, "source_row")
                or _string_value(item, "row")
                or str(row_number)
            )
            normalized_source = _source_value(item.get("source", "MANUAL"))
            category, subcategory = _resolve_structured_classification(
                session=session,
                item=item,
                category_by_id=category_by_id,
                category_by_name_kind=category_by_name_kind,
                subcategory_by_id=subcategory_by_id,
                subcategory_by_category_name=subcategory_by_category_name,
            )
            classification = resolve_movement_classification(
                session,
                category_id=category.id,
                subcategory_id=subcategory.id if subcategory is not None else None,
            )
            import_hash = _fingerprint_payload(
                source_file=source_file,
                external_id=external_id,
                source_row=source_row,
                date=raw_date,
                amount_cents=amount_cents,
                business=business,
                reason=reason,
                raw_description=raw_description,
            )
            similarity_key = _similarity_key(
                date=raw_date,
                amount_cents=amount_cents,
                business=business,
                reason=reason,
                raw_description=raw_description,
            )
            duplicate_of = known_hashes.get(import_hash) if import_hash else None
            if duplicate_of is not None:
                duplicate += 1
                rows.append(
                    ImportRowStatus(
                        row=row_number,
                        status="duplicate",
                        duplicate_of=duplicate_of,
                    )
                )
                continue
            duplicate_warning = (
                "possible_duplicate" if similarity_key in known_similar else None
            )

            reviewed = _bool_value(item, "reviewed", False)
            movement = Movement(
                date=raw_date,
                accounting_date=accounting_date,
                amount_cents=amount_cents,
                business=business,
                reason=reason,
                source=normalized_source,
                raw_description=raw_description or None,
                source_file=source_file,
                external_id=external_id,
                source_row=source_row,
                import_hash=import_hash,
                duplicate_warning=duplicate_warning,
                reviewed=reviewed,
                category_id=classification.category.id,
                subcategory_id=classification.subcategory.id
                if classification.subcategory is not None
                else None,
            )
            session.add(movement)
            session.commit()
            session.refresh(movement)
            if import_hash is not None:
                known_hashes[import_hash] = movement.id
            known_similar[similarity_key] = movement.id
            inserted += 1
            rows.append(
                ImportRowStatus(row=row_number, status="inserted", movement_id=movement.id)
            )
        except Exception as exc:  # noqa: BLE001 - row-level import should keep going
            session.rollback()
            errors.append(ImportRowError(row=row_number, error=str(exc)))
            rows.append(ImportRowStatus(row=row_number, status="failed", error=str(exc)))

    return ImportOutcome(
        file=file_label,
        inserted=inserted,
        duplicate=duplicate,
        failed=len(errors),
        errors=errors,
        rows=rows,
    )


def import_movements_from_csv(
    session: Session,
    csv_text: str,
    *,
    file_label: str = "uploaded.csv",
) -> ImportOutcome:
    """Import movements from a CSV string into the database."""
    records = parse_csv_text(csv_text)
    if not records:
        return ImportOutcome(file=file_label, inserted=0)

    subcategories = session.exec(select(Subcategory)).all()
    subcategory_map: dict[str, Subcategory] = {
        normalize_key(sub.name): sub for sub in subcategories
    }
    subcategory_by_id: dict[str, Subcategory] = {sub.id: sub for sub in subcategories}

    categories = session.exec(select(Category)).all()
    category_by_id: dict[str, Category] = {cat.id: cat for cat in categories}
    fallback_category = _fallback_category(session)

    # Memory of past business → classification choices made by the user.
    memory_lookup = memory_index(build_classification_memory(session))

    structured: list[dict[str, Any]] = []
    parse_errors: list[ImportRowError] = []

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
            #   1. Explicit subcategory column in the file -> derive category from sub.
            #   2. Memory match for this business -> copy its category (and sub if any).
            #   3. Fallback to the first available category.
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
                    category_id = fallback_category.id
                    sub = None

            normalized_source_text = (source_text or "MANUAL").upper()
            try:
                MovementSource(normalized_source_text)
            except ValueError as exc:
                raise ValueError(f"Origen desconocido: {source_text}") from exc

            initial_reviewed = (
                parse_boolean(reviewed_text) if reviewed_text != "" else False
            )
            structured.append(
                {
                    "date": date_text,
                    "accounting_date": accounting_date_text,
                    "amount": amount_cents / 100,
                    "business": business_value,
                    "reason": reason_value,
                    "source": normalized_source_text,
                    "raw_description": raw_description or reason_value,
                    "source_file": file_label,
                    "source_row": str(row_number),
                    "reviewed": initial_reviewed,
                    "category_id": category_id,
                    "subcategory_id": sub.id if sub is not None else None,
                    "_row_number": row_number,
                }
            )
        except Exception as exc:  # noqa: BLE001 - we want to surface every error to the caller
            session.rollback()
            parse_errors.append(ImportRowError(row=row_number, error=str(exc)))

    outcome = import_movements_structured(session, structured, file_label=file_label)
    if not parse_errors:
        return outcome
    offset_rows = outcome.rows
    return ImportOutcome(
        file=file_label,
        inserted=outcome.inserted,
        duplicate=outcome.duplicate,
        failed=outcome.failed + len(parse_errors),
        errors=[*parse_errors, *outcome.errors],
        rows=[
            *[
                ImportRowStatus(row=err.row, status="failed", error=err.error)
                for err in parse_errors
            ],
            *offset_rows,
        ],
    )
