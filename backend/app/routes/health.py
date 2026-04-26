"""Health endpoint used by Docker, scripts and the frontend smoke test."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from app.database import get_session
from app.schemas import HealthRead

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthRead)
def health(session: Session = Depends(get_session)) -> HealthRead:
    # ``Session.execute`` is the right entry point for raw SQL with SQLAlchemy 2.x.
    session.execute(text("SELECT 1"))
    return HealthRead(status="ok", database="sqlite")
