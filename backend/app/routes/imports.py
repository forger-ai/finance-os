"""Import endpoints — CSV pipeline plus AI extraction for PDF and images."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from openai import APIError, AuthenticationError, OpenAIError
from sqlmodel import Session

from app.database import get_session
from app.schemas import ImportError as ImportErrorSchema
from app.schemas import ImportResult
from app.services.extract_movements import extract_movements_from_file
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
_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic"}


def _translate_openai_error(exc: Exception) -> HTTPException:
    """Map OpenAI / config errors to user-facing HTTP errors."""
    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, AuthenticationError):
        return HTTPException(
            status_code=401,
            detail="OpenAI rechazó la API key. Revísala en Configuración → API Keys.",
        )
    if isinstance(exc, APIError):
        return HTTPException(
            status_code=502,
            detail=f"OpenAI rechazó la solicitud: {exc.message}",
        )
    return HTTPException(status_code=502, detail=f"Error de OpenAI: {exc}")


def _csv_or_llm(
    session: Session,
    csv_text: str,
    file_label: str,
    *,
    raw_bytes: bytes,
) -> ImportOutcome:
    """Try the deterministic importer first; fall back to LLM extraction.

    The deterministic path requires at minimum a recognizable date column and
    one of amount/cargo/abono. When the headers don't match (typical of bank
    exports with a banner row, multi-row headers, or fully custom column
    names), we send the same text to the LLM for unstructured extraction.
    """
    if has_recognizable_schema(csv_text):
        return import_movements_from_csv(session, csv_text, file_label=file_label)
    try:
        return extract_movements_from_file(
            session,
            file_bytes=raw_bytes,
            content_type="text/csv",
            file_label=file_label,
        )
    except RuntimeError as exc:
        # Missing API key etc. — bubble up so the route translates to 503.
        raise exc


def _outcome_to_schema(outcome: ImportOutcome) -> ImportResult:
    return ImportResult(
        file=outcome.file,
        inserted=outcome.inserted,
        failed=outcome.failed,
        errors=[ImportErrorSchema(row=err.row, error=err.error) for err in outcome.errors],
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


def _looks_like_pdf(filename: str | None, content_type: str | None) -> bool:
    if content_type and content_type.lower() == "application/pdf":
        return True
    return bool(filename and filename.lower().endswith(".pdf"))


def _looks_like_image(filename: str | None, content_type: str | None) -> bool:
    if content_type and content_type.lower() in _IMAGE_TYPES:
        return True
    if filename:
        lower = filename.lower()
        return any(lower.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".heic"))
    return False


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
        ..., description="CSV, PDF, or image (PNG/JPEG/WebP) of a bank statement."
    ),
    session: Session = Depends(get_session),
) -> ImportResult:
    """Single endpoint that dispatches by content type.

    - CSV → existing deterministic importer.
    - PDF / image → OpenAI multimodal extraction; rows persist as ``reviewed=False``
      so the Review queue picks them up.
    """
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
        try:
            outcome = _csv_or_llm(
                session, text, filename, raw_bytes=text.encode("utf-8")
            )
        except (RuntimeError, AuthenticationError, APIError, OpenAIError) as exc:
            raise _translate_openai_error(exc) from exc
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
        try:
            outcome = _csv_or_llm(
                session, csv_text, filename, raw_bytes=csv_text.encode("utf-8")
            )
        except (RuntimeError, AuthenticationError, APIError, OpenAIError) as exc:
            raise _translate_openai_error(exc) from exc
        return _outcome_to_schema(outcome)

    if _looks_like_pdf(filename, content_type):
        normalized_type = "application/pdf"
    elif _looks_like_image(filename, content_type):
        # Pillow-less normalization: trust the provided content type if it's an image,
        # otherwise infer from extension. Fall back to image/png as a safe default.
        if content_type.startswith("image/"):
            normalized_type = content_type
        else:
            ext = filename.lower().rsplit(".", 1)[-1]
            normalized_type = "image/jpeg" if ext in {"jpg", "jpeg"} else f"image/{ext}"
    else:
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported file type. Upload a CSV, XLSX, PDF, or image "
                "(PNG/JPEG/WebP)."
            ),
        )

    try:
        outcome = extract_movements_from_file(
            session,
            file_bytes=raw,
            content_type=normalized_type,
            file_label=filename,
        )
    except (RuntimeError, AuthenticationError, APIError, OpenAIError) as exc:
        raise _translate_openai_error(exc) from exc

    return _outcome_to_schema(outcome)
