"""Settings persistence — generic key-value store with LLM-specific helpers."""

from __future__ import annotations

import os

from sqlmodel import Session

from app.models import Setting, utcnow

# Namespaced keys. Keep them stable — they live in the SQLite file forever.
LLM_OPENAI_API_KEY = "llm.openai.api_key"
LLM_OPENAI_MODEL = "llm.openai.model"

# Default model when nothing is configured. Multimodal-capable.
DEFAULT_OPENAI_MODEL = "gpt-4o-2024-11-20"


def get_setting(session: Session, key: str) -> str | None:
    row = session.get(Setting, key)
    return row.value if row is not None else None


def set_setting(session: Session, key: str, value: str | None) -> Setting:
    row = session.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=value)
        session.add(row)
    else:
        row.value = value
        row.updated_at = utcnow()
    session.commit()
    session.refresh(row)
    return row


def get_openai_api_key(session: Session) -> str | None:
    """DB value wins over env var so the UI can override deployment defaults."""
    stored = get_setting(session, LLM_OPENAI_API_KEY)
    if stored:
        return stored
    env = os.getenv("OPENAI_API_KEY")
    return env or None


def get_openai_model(session: Session) -> str:
    stored = get_setting(session, LLM_OPENAI_MODEL)
    if stored:
        return stored
    env = os.getenv("OPENAI_MODEL")
    return env or DEFAULT_OPENAI_MODEL


def mask_secret(secret: str | None) -> str | None:
    """Return a UI-safe preview (last 4 chars). ``None`` if unset."""
    if not secret:
        return None
    if len(secret) <= 4:
        return "*" * len(secret)
    return f"…{secret[-4:]}"
