"""Application settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.schemas import SettingsRead, SettingsUpdate
from app.services.settings import settings_payload, update_primary_currency_code

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings", response_model=SettingsRead)
def get_settings(session: Session = Depends(get_session)) -> SettingsRead:
    return SettingsRead(**settings_payload(session))


@router.patch("/settings", response_model=SettingsRead)
def update_settings(
    payload: SettingsUpdate,
    session: Session = Depends(get_session),
) -> SettingsRead:
    if payload.primary_currency_code is not None:
        update_primary_currency_code(session, payload.primary_currency_code)
    return SettingsRead(**settings_payload(session))
