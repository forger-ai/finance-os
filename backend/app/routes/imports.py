"""CSV import endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session

from app.database import get_session
from app.schemas import ImportError as ImportErrorSchema
from app.schemas import ImportResult
from app.services.import_movements import import_movements_from_csv

router = APIRouter(prefix="/api", tags=["imports"])


@router.post("/imports/movements-csv", response_model=ImportResult)
async def import_movements_csv(
    file: UploadFile = File(..., description="CSV file with movement rows"),
    session: Session = Depends(get_session),
) -> ImportResult:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="Missing file.")
    raw = await file.read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"CSV must be UTF-8: {exc}") from exc

    outcome = import_movements_from_csv(session, text, file_label=file.filename)
    return ImportResult(
        file=outcome.file,
        inserted=outcome.inserted,
        failed=outcome.failed,
        errors=[ImportErrorSchema(row=err.row, error=err.error) for err in outcome.errors],
    )
