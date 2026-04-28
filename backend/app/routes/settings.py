"""User-managed settings (LLM provider credentials, model overrides)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from app.database import get_session
from app.services.settings import (
    DEFAULT_OPENAI_MODEL,
    LLM_OPENAI_API_KEY,
    LLM_OPENAI_MODEL,
    get_openai_api_key,
    get_openai_model,
    mask_secret,
    set_setting,
)

router = APIRouter(prefix="/api", tags=["settings"])


class _Base(BaseModel):
    # ``protected_namespaces=()`` lets us name fields like ``model`` and
    # ``model_default`` without colliding with Pydantic's internal ``model_*``
    # attribute namespace.
    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
        protected_namespaces=(),
    )


class LLMProviderRead(_Base):
    id: str
    label: str
    key_set: bool
    key_preview: str | None
    model: str
    model_default: str


class LLMSettingsRead(_Base):
    providers: list[LLMProviderRead] = Field(default_factory=list)


class LLMOpenAIUpdate(_Base):
    """Update payload for the OpenAI provider.

    A field omitted from the JSON body means "no change". A field set to
    ``null`` clears the stored value. A non-empty string overwrites it.
    """

    api_key: str | None = None
    model: str | None = None


@router.get("/settings/llm", response_model=LLMSettingsRead)
def read_llm_settings(session: Session = Depends(get_session)) -> LLMSettingsRead:
    api_key = get_openai_api_key(session)
    model = get_openai_model(session)
    return LLMSettingsRead(
        providers=[
            LLMProviderRead(
                id="openai",
                label="OpenAI",
                key_set=bool(api_key),
                key_preview=mask_secret(api_key),
                model=model,
                model_default=DEFAULT_OPENAI_MODEL,
            )
        ]
    )


@router.put("/settings/llm/openai", response_model=LLMSettingsRead)
def update_llm_openai(
    payload: LLMOpenAIUpdate,
    session: Session = Depends(get_session),
) -> LLMSettingsRead:
    fields_set = payload.model_fields_set

    if "api_key" in fields_set:
        # Treat empty string as "clear" so the UI can submit a blank field
        # without distinguishing it from null.
        normalized = (payload.api_key or "").strip() or None
        set_setting(session, LLM_OPENAI_API_KEY, normalized)

    if "model" in fields_set:
        normalized_model = (payload.model or "").strip() or None
        set_setting(session, LLM_OPENAI_MODEL, normalized_model)

    return read_llm_settings(session)
