"""Application settings and visual currency-format preferences."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlmodel import Session

from app.models import Setting, utcnow

PRIMARY_CURRENCY_CODE_KEY = "primary_currency_code"
DEFAULT_PRIMARY_CURRENCY_CODE = "CLP"


@lru_cache(maxsize=1)
def currency_formats() -> list[dict[str, Any]]:
    path = Path(__file__).resolve().parent.parent / "currency_formats.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    return sorted(raw, key=lambda item: str(item["code"]))


def currency_format_by_code(code: str) -> dict[str, Any] | None:
    normalized = code.strip().upper()
    return next(
        (item for item in currency_formats() if item["code"] == normalized),
        None,
    )


def validate_currency_code(code: str) -> str:
    normalized = code.strip().upper()
    if currency_format_by_code(normalized) is None:
        raise ValueError(f"Formato de divisa no soportado: {code}")
    return normalized


def get_primary_currency_code(session: Session) -> str:
    setting = session.get(Setting, PRIMARY_CURRENCY_CODE_KEY)
    if setting is None or not setting.value:
        return DEFAULT_PRIMARY_CURRENCY_CODE
    try:
        return validate_currency_code(setting.value)
    except ValueError:
        return DEFAULT_PRIMARY_CURRENCY_CODE


def update_primary_currency_code(session: Session, code: str) -> str:
    normalized = validate_currency_code(code)
    setting = session.get(Setting, PRIMARY_CURRENCY_CODE_KEY)
    if setting is None:
        setting = Setting(key=PRIMARY_CURRENCY_CODE_KEY)
    setting.value = normalized
    setting.updated_at = utcnow()
    session.add(setting)
    session.commit()
    return normalized


def settings_payload(session: Session) -> dict[str, Any]:
    primary_code = get_primary_currency_code(session)
    primary_format = currency_format_by_code(primary_code)
    if primary_format is None:
        primary_code = DEFAULT_PRIMARY_CURRENCY_CODE
        primary_format = currency_format_by_code(primary_code)
    return {
        "primary_currency_code": primary_code,
        "configured_currency_codes": [primary_code],
        "primary_currency_format": primary_format,
        "currency_formats": currency_formats(),
    }
