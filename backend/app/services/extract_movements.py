"""Extract bank-statement movements from a PDF or image via OpenAI.

The flow:
  1. Send the file to OpenAI with a JSON-schema-constrained response that lists
     transactions and a best-effort subcategory pick.
  2. Resolve each subcategory name against the database (case- and accent-
     insensitive); unknown names fall back to "Sin clasificar".
  3. Insert each row as ``reviewed=False`` so the existing review queue picks
     them up. Duplicates (same date+amount+business+reason+source+raw) are
     skipped to keep re-uploads safe.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any

from openai import OpenAI
from sqlmodel import Session, select

from app.models import Movement, MovementSource, Subcategory
from app.services.bootstrap import UNCLASSIFIED_NAME, ensure_unclassified_subcategory
from app.services.classification_memory import (
    MemoryEntry,
    build_classification_memory,
)
from app.services.import_movements import ImportOutcome, ImportRowError, _build_duplicate_key
from app.services.settings import get_openai_api_key, get_openai_model
from app.utils import normalize_key, parse_date_input, to_cents

_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "movements": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Transaction date as YYYY-MM-DD.",
                    },
                    "accounting_date": {
                        "type": "string",
                        "description": (
                            "Posting/accounting date as YYYY-MM-DD. Use the same "
                            "value as date if the document only shows one date."
                        ),
                    },
                    "amount": {
                        "type": "number",
                        "description": (
                            "Amount in pesos. Negative for expenses/debits, "
                            "positive for income/credits."
                        ),
                    },
                    "business": {
                        "type": "string",
                        "description": "Short merchant or counterparty name.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief Spanish description of the transaction.",
                    },
                    "raw_description": {
                        "type": "string",
                        "description": "The original line as it appears in the document.",
                    },
                    "source": {
                        "type": "string",
                        "enum": ["BANK", "CREDIT_CARD", "MANUAL"],
                    },
                    "subcategory_name": {
                        "type": "string",
                        "description": (
                            "Best matching subcategory from the provided list, "
                            f"or '{UNCLASSIFIED_NAME}' when uncertain."
                        ),
                    },
                },
                "required": [
                    "date",
                    "accounting_date",
                    "amount",
                    "business",
                    "reason",
                    "raw_description",
                    "source",
                    "subcategory_name",
                ],
            },
        }
    },
    "required": ["movements"],
}


def _build_prompt(
    subcategory_names: list[str],
    memory: list[MemoryEntry],
) -> str:
    catalog = "\n".join(f"- {name}" for name in subcategory_names)

    if memory:
        memory_lines = "\n".join(
            f'- "{entry.business}" → {entry.category_name} / {entry.subcategory_name}'
            f" (visto {entry.count}x)"
            for entry in memory
        )
        memory_block = (
            "Past classifications confirmed by the user. Treat these as strong "
            "preferences: when a new transaction's business clearly matches one "
            "of these entries, reuse the same subcategory unless the new "
            "transaction is obviously different in nature.\n"
            f"{memory_lines}\n\n"
        )
    else:
        memory_block = ""

    return (
        "You are extracting transactions from a Chilean bank statement, credit "
        "card statement, transfer receipt, or screenshot.\n\n"
        "Return every transaction visible in the document. Do not invent rows. "
        "If a value is not visible, infer the most plausible one from context "
        "but never hallucinate amounts or dates.\n\n"
        "Sign convention: amount is NEGATIVE for expenses/debits/cargos and "
        "POSITIVE for income/credits/abonos.\n\n"
        "Source: use BANK for checking/savings accounts and transfers, "
        "CREDIT_CARD for credit-card statements, MANUAL for anything else.\n\n"
        f"{memory_block}"
        "Subcategory: pick the best match from the catalog below. If no good "
        f"match exists or you are uncertain, use exactly '{UNCLASSIFIED_NAME}'.\n\n"
        f"Subcategory catalog:\n{catalog}\n"
    )


@dataclass
class _Extracted:
    date: str
    accounting_date: str
    amount: float
    business: str
    reason: str
    raw_description: str
    source: str
    subcategory_name: str


def _client(session: Session) -> OpenAI:
    api_key = get_openai_api_key(session)
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY no está configurada. Agrégala en Configuración → "
            "API Keys o en la variable de entorno OPENAI_API_KEY."
        )
    return OpenAI(api_key=api_key)


def _content_for_pdf(client: OpenAI, file_bytes: bytes, filename: str) -> tuple[list[dict], str]:
    file_obj = client.files.create(
        file=(filename, file_bytes, "application/pdf"),
        purpose="user_data",
    )
    content = [{"type": "file", "file": {"file_id": file_obj.id}}]
    return content, file_obj.id


def _content_for_image(file_bytes: bytes, mime: str) -> list[dict]:
    encoded = base64.b64encode(file_bytes).decode("ascii")
    return [
        {
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{encoded}"},
        }
    ]


def _content_for_text(text: str) -> list[dict]:
    """Wrap a tabular text payload (CSV/XLSX→CSV) for the LLM call.

    The text is shown to the model BEFORE the prompt, so we frame it as the
    document being analyzed.
    """
    fenced = f"Bank export to extract:\n\n```\n{text.strip()}\n```"
    return [{"type": "text", "text": fenced}]


def _call_openai(
    *,
    client: OpenAI,
    model: str,
    user_content: list[dict],
    prompt: str,
) -> list[_Extracted]:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [*user_content, {"type": "text", "text": prompt}],
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "movements_extraction",
                "schema": _RESPONSE_SCHEMA,
                "strict": True,
            },
        },
    )
    text = response.choices[0].message.content or "{}"
    payload = json.loads(text)
    raw_movements = payload.get("movements", [])
    return [_Extracted(**item) for item in raw_movements]


def _resolve_subcategory(
    name: str,
    subcategory_map: dict[str, Subcategory],
    fallback: Subcategory,
) -> Subcategory:
    candidate = subcategory_map.get(normalize_key(name))
    return candidate if candidate is not None else fallback


def extract_movements_from_file(
    session: Session,
    *,
    file_bytes: bytes,
    content_type: str,
    file_label: str,
) -> ImportOutcome:
    """Run extraction and persist new movements as ``reviewed=False``."""
    client = _client(session)
    model = get_openai_model(session)

    fallback = ensure_unclassified_subcategory(session)
    subcategories = session.exec(select(Subcategory)).all()
    subcategory_map: dict[str, Subcategory] = {
        normalize_key(sub.name): sub for sub in subcategories
    }
    catalog_names = sorted({sub.name for sub in subcategories})
    memory = build_classification_memory(session, limit=50)
    prompt = _build_prompt(catalog_names, memory)

    uploaded_file_id: str | None = None
    if content_type == "application/pdf":
        content, uploaded_file_id = _content_for_pdf(client, file_bytes, file_label)
    elif content_type.startswith("image/"):
        content = _content_for_image(file_bytes, content_type)
    elif content_type in ("text/csv", "text/plain"):
        content = _content_for_text(file_bytes.decode("utf-8", errors="replace"))
    else:
        raise ValueError(
            f"Unsupported content type for extraction: {content_type!r}. "
            "Use PDF, image, or CSV-like text."
        )

    try:
        extracted = _call_openai(
            client=client,
            model=model,
            user_content=content,
            prompt=prompt,
        )
    finally:
        if uploaded_file_id is not None:
            try:
                client.files.delete(uploaded_file_id)
            except Exception:  # noqa: BLE001 - cleanup is best-effort
                pass

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

    for index, item in enumerate(extracted, start=1):
        try:
            raw_date = parse_date_input(item.date)
            accounting_date = (
                parse_date_input(item.accounting_date)
                if item.accounting_date
                else raw_date
            )
            try:
                source = MovementSource(item.source.upper())
            except ValueError as exc:
                raise ValueError(f"Unknown source: {item.source}") from exc

            amount_cents = to_cents(item.amount)
            sub = _resolve_subcategory(item.subcategory_name, subcategory_map, fallback)

            duplicate_key = _build_duplicate_key(
                amount_cents=amount_cents,
                date=raw_date,
            )
            if duplicate_key in known_keys:
                raise ValueError(
                    "Ya existe un movimiento con esta fecha y monto."
                )

            movement = Movement(
                date=raw_date,
                accounting_date=accounting_date,
                amount_cents=amount_cents,
                business=item.business or "—",
                reason=item.reason or item.raw_description or "—",
                source=source,
                raw_description=item.raw_description or None,
                reviewed=False,
                category_id=sub.category_id,
                subcategory_id=sub.id,
            )
            session.add(movement)
            session.commit()
            session.refresh(movement)
            known_keys.add(duplicate_key)
            inserted += 1
        except Exception as exc:  # noqa: BLE001 - surface every error to the caller
            session.rollback()
            errors.append(ImportRowError(row=index, error=str(exc)))

    return ImportOutcome(
        file=file_label,
        inserted=inserted,
        failed=len(errors),
        errors=errors,
    )
