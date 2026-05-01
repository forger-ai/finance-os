"""Import endpoints for local CSV/XLSX movement loading."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session

from app.database import get_session
from app.schemas import ImportError as ImportErrorSchema
from app.schemas import ImportResult, PreprocessedDocumentRead
from app.services.document_preprocessor import preprocess_document
from app.services.import_movements import (
    ImportOutcome,
    has_recognizable_schema,
    import_movements_from_csv,
)
from app.services.xlsx_to_csv import xlsx_to_csv

router = APIRouter(prefix="/api", tags=["imports"])


_CSV_TYPES = {"text/csv", "application/csv"}
_XLSX_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",  # legacy mime some browsers send for xlsx
}


def _csv_import_or_reject(
    session: Session,
    csv_text: str,
    file_label: str,
) -> ImportOutcome:
    """Import recognizable local tabular files and reject ambiguous layouts."""
    if has_recognizable_schema(csv_text):
        return import_movements_from_csv(session, csv_text, file_label=file_label)
    raise HTTPException(
        status_code=422,
        detail=(
            "No reconozco las columnas del archivo. Usa un CSV/XLSX con fecha "
            "y monto, o sube un PDF/imagen para procesarlo con el asistente desde Forger."
        ),
    )


def _outcome_to_schema(outcome: ImportOutcome) -> ImportResult:
    return ImportResult(
        file=outcome.file,
        inserted=outcome.inserted,
        duplicate=outcome.duplicate,
        failed=outcome.failed,
        errors=[ImportErrorSchema(row=err.row, error=err.error) for err in outcome.errors],
    )


@router.post("/imports/preprocess-document", response_model=PreprocessedDocumentRead)
async def preprocess_import_document(
    file: UploadFile = File(..., description="Statement file to preprocess locally"),
) -> PreprocessedDocumentRead:
    filename = file.filename or "upload"
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    try:
        document = preprocess_document(
            filename=filename,
            content_type=file.content_type or "",
            data=raw,
        )
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"File must be UTF-8: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - extraction libraries expose varied errors
        raise HTTPException(
            status_code=422,
            detail=f"No se pudo preprocesar el archivo: {exc}",
        ) from exc
    return PreprocessedDocumentRead(
        filename=document.filename,
        content_type=document.content_type,
        kind=document.kind,
        text=document.text,
        row_count=document.row_count,
        page_count=document.page_count,
        warning=document.warning,
    )


def _looks_like_csv(filename: str | None, content_type: str | None) -> bool:
    if content_type and content_type.lower() in _CSV_TYPES:
        return True
    return bool(filename and filename.lower().endswith(".csv"))


def _looks_like_xlsx(filename: str | None, content_type: str | None) -> bool:
    # The legacy Excel mime is shared by .xls and .xlsx; here we only support
    # .xlsx, so we still require the extension when relying on that mime.
    if filename and filename.lower().endswith(".xlsx"):
        return True
    return bool(
        content_type
        and content_type.lower()
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


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
    return _outcome_to_schema(outcome)


@router.post("/imports/movements-extract", response_model=ImportResult)
async def import_movements_extract(
    file: UploadFile = File(
        ..., description="CSV or XLSX file with movement rows."
    ),
    session: Session = Depends(get_session),
) -> ImportResult:
    """Single endpoint used by the upload flow for local tabular files."""
    filename = file.filename or "upload"
    content_type = (file.content_type or "").lower()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")

    if _looks_like_csv(filename, content_type):
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"CSV must be UTF-8: {exc}") from exc
        outcome = _csv_import_or_reject(session, text, filename)
        return _outcome_to_schema(outcome)

    if _looks_like_xlsx(filename, content_type):
        try:
            csv_text = xlsx_to_csv(raw)
        except Exception as exc:  # noqa: BLE001 - openpyxl error surface varies
            raise HTTPException(
                status_code=400,
                detail=f"No se pudo leer el archivo .xlsx: {exc}",
            ) from exc
        if not csv_text.strip():
            raise HTTPException(
                status_code=400,
                detail="El archivo .xlsx está vacío o no tiene una hoja con datos.",
            )
        outcome = _csv_import_or_reject(session, csv_text, filename)
        return _outcome_to_schema(outcome)
    raise HTTPException(
        status_code=415,
        detail="Tipo de archivo no soportado por el importador local. Usa CSV/XLSX.",
    )
