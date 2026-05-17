"""Assistant task endpoints for browser-safe Finance OS flows."""

from __future__ import annotations

import base64
import json
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.forger_desktop import (
    ForgerDesktopRuntimeError,
    ForgerDesktopRuntimeUnavailable,
    cancel_agent_task,
    get_agent_task,
    get_agent_task_status,
    start_agent_task,
)
from app.schemas import (
    AssistantStatusRead,
    AssistantTaskRead,
    BudgetRecommendationRequest,
    CancelResult,
)
from app.services.document_preprocessor import preprocess_document

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

MOVEMENT_IMPORT_TEMPLATES = {
    "first_run_finance_os_import",
    "extract_movements_from_statement",
}
DEFAULT_MOVEMENT_IMPORT_TEMPLATE = "extract_movements_from_statement"
RECOMMEND_BUDGET_TEMPLATE = "recommend_budget"
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
MAX_USER_NOTE_CHARS = 2_000
MAX_LOCALE_CHARS = 16
MAX_PREPROCESSED_DOCUMENTS_CHARS = 200_000
ACCEPTED_EXTENSIONS = {
    ".csv",
    ".heic",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".webp",
    ".xlsx",
}
ACCEPTED_CONTENT_TYPES = {
    "application/csv",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/heic",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/csv",
}


@router.get("/status", response_model=AssistantStatusRead)
def assistant_status() -> AssistantStatusRead:
    try:
        return AssistantStatusRead(**get_agent_task_status())
    except ForgerDesktopRuntimeUnavailable:
        return AssistantStatusRead()
    except ForgerDesktopRuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/tasks/movement-import", response_model=AssistantTaskRead)
async def start_movement_import_task(
    files: list[UploadFile] = File(..., description="Financial statement files"),
    template_id: str = Form(DEFAULT_MOVEMENT_IMPORT_TEMPLATE),
    user_note: str = Form(""),
    locale: str = Form("es"),
) -> AssistantTaskRead:
    normalized_template_id = template_id.strip() or DEFAULT_MOVEMENT_IMPORT_TEMPLATE
    if normalized_template_id not in MOVEMENT_IMPORT_TEMPLATES:
        raise HTTPException(status_code=400, detail="Unsupported movement import task.")
    if len(user_note) > MAX_USER_NOTE_CHARS:
        raise HTTPException(status_code=413, detail="The import note is too long.")
    if len(locale) > MAX_LOCALE_CHARS:
        raise HTTPException(status_code=400, detail="The selected locale is not supported.")
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    statement_files: list[dict[str, Any]] = []
    preprocessed_documents: list[dict[str, Any]] = []
    total_bytes = 0
    for upload in files:
        filename = upload.filename or "upload"
        content_type = upload.content_type or ""
        raw = await upload.read()
        if not raw:
            raise HTTPException(status_code=400, detail=f"{filename} is empty.")
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail=f"{filename} is too large.")
        total_bytes += len(raw)
        if total_bytes > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=413, detail="The selected files are too large.")
        if not _accepted_file(filename, content_type):
            raise HTTPException(status_code=415, detail=f"{filename} is not supported.")

        statement_files.append(
            {
                "type": "file",
                "name": filename,
                "mimeType": content_type or None,
                "dataBase64": base64.b64encode(raw).decode("ascii"),
            }
        )
        preprocessed_documents.append(_preprocess_for_task(filename, content_type, raw))

    return _start_task(
        template_id=normalized_template_id,
        locale=locale,
        arguments={
            "statement": statement_files,
            "preprocessedDocuments": {
                "type": "string",
                "value": _preprocessed_documents_argument(preprocessed_documents),
            },
            "locale": {"type": "string", "value": locale},
            "userNote": {"type": "string", "value": user_note},
        },
    )


@router.post("/tasks/budget-recommendation", response_model=AssistantTaskRead)
def start_budget_recommendation_task(
    payload: BudgetRecommendationRequest,
) -> AssistantTaskRead:
    return _start_task(
        template_id=RECOMMEND_BUDGET_TEMPLATE,
        locale=payload.locale or "es",
        arguments={
            "expectedIncome": {"type": "string", "value": payload.expectedIncome},
            "locale": {"type": "string", "value": payload.locale or "es"},
            "month": {"type": "string", "value": payload.month},
            "year": {"type": "string", "value": payload.year},
        },
    )


@router.get("/tasks/{run_id}", response_model=AssistantTaskRead)
def get_task(run_id: str) -> AssistantTaskRead:
    try:
        task = get_agent_task(run_id)
    except ForgerDesktopRuntimeUnavailable as exc:
        raise HTTPException(status_code=503, detail="Assistant runtime is not available.") from exc
    except ForgerDesktopRuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return AssistantTaskRead(**task)


@router.post("/tasks/{run_id}/cancel", response_model=CancelResult)
def cancel_task(run_id: str) -> CancelResult:
    try:
        return CancelResult(**cancel_agent_task(run_id))
    except ForgerDesktopRuntimeUnavailable as exc:
        raise HTTPException(status_code=503, detail="Assistant runtime is not available.") from exc
    except ForgerDesktopRuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _start_task(
    *,
    template_id: str,
    locale: str,
    arguments: dict[str, Any],
) -> AssistantTaskRead:
    try:
        task = start_agent_task(
            template_id=template_id,
            locale=locale,
            arguments=arguments,
        )
    except ForgerDesktopRuntimeUnavailable as exc:
        raise HTTPException(status_code=503, detail="Assistant runtime is not available.") from exc
    except ForgerDesktopRuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return AssistantTaskRead(**task)


def _accepted_file(filename: str, content_type: str) -> bool:
    normalized_type = content_type.lower()
    if normalized_type in ACCEPTED_CONTENT_TYPES:
        return True
    lower_name = filename.lower()
    return any(lower_name.endswith(extension) for extension in ACCEPTED_EXTENSIONS)


def _preprocess_for_task(filename: str, content_type: str, raw: bytes) -> dict[str, Any]:
    try:
        document = preprocess_document(
            filename=filename,
            content_type=content_type,
            data=raw,
        )
        return {
            "filename": document.filename,
            "content_type": document.content_type,
            "kind": document.kind,
            "text": document.text,
            "row_count": document.row_count,
            "page_count": document.page_count,
            "warning": document.warning,
        }
    except Exception as exc:  # noqa: BLE001 - extraction libraries expose varied errors
        return {
            "filename": filename,
            "content_type": content_type,
            "kind": "preprocess_error",
            "text": "",
            "row_count": None,
            "page_count": None,
            "warning": str(exc),
        }


def _preprocessed_documents_argument(documents: list[dict[str, Any]]) -> str:
    payload = json.dumps(documents, separators=(",", ":"))
    if len(payload) <= MAX_PREPROCESSED_DOCUMENTS_CHARS:
        return payload

    compacted = [dict(document) for document in documents]
    text_budget = max(0, MAX_PREPROCESSED_DOCUMENTS_CHARS // max(1, len(compacted)) - 800)
    while True:
        for document in compacted:
            text = document.get("text")
            if isinstance(text, str) and len(text) > text_budget:
                document["text"] = _truncate_for_argument(text, text_budget)
                warning = document.get("warning")
                suffix = "Preprocessed text was shortened to fit the assistant task limit."
                document["warning"] = f"{warning} {suffix}" if warning else suffix

        payload = json.dumps(compacted, separators=(",", ":"))
        if len(payload) <= MAX_PREPROCESSED_DOCUMENTS_CHARS:
            return payload
        if text_budget == 0:
            raise HTTPException(status_code=413, detail="The selected files are too large.")
        text_budget = max(0, text_budget // 2)


def _truncate_for_argument(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    suffix = "\n\n[Truncated to fit the assistant task limit.]"
    if max_chars <= len(suffix):
        return text[:max_chars]
    return f"{text[: max_chars - len(suffix)]}{suffix}"
