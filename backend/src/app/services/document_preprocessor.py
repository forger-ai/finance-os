"""Local document preprocessing before assistant tasks."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from pypdf import PdfReader

from app.services.xlsx_to_csv import xlsx_to_csv


@dataclass
class PreprocessedDocument:
    filename: str
    content_type: str
    kind: str
    text: str
    row_count: int | None = None
    page_count: int | None = None
    warning: str | None = None


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}\n\n[Truncated to {max_chars} characters.]"


def _count_csv_rows(text: str) -> int:
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    return max(0, len(rows) - 1)


def preprocess_document(
    *,
    filename: str,
    content_type: str,
    data: bytes,
    max_chars: int = 120_000,
) -> PreprocessedDocument:
    lower_name = filename.lower()
    lower_type = content_type.lower()

    if lower_name.endswith(".csv") or lower_type in {"text/csv", "application/csv"}:
        text = data.decode("utf-8")
        return PreprocessedDocument(
            filename=filename,
            content_type=content_type,
            kind="csv",
            text=_truncate(text, max_chars),
            row_count=_count_csv_rows(text),
        )

    if lower_name.endswith(".xlsx") or lower_type == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ):
        text = xlsx_to_csv(data)
        return PreprocessedDocument(
            filename=filename,
            content_type=content_type,
            kind="xlsx_as_csv",
            text=_truncate(text, max_chars),
            row_count=_count_csv_rows(text),
        )

    if lower_name.endswith(".pdf") or lower_type == "application/pdf":
        reader = PdfReader(io.BytesIO(data))
        pages: list[str] = []
        for page_number, page in enumerate(reader.pages, start=1):
            page_text = (page.extract_text() or "").strip()
            if page_text:
                pages.append(f"--- Page {page_number} ---\n{page_text}")
        text = "\n\n".join(pages).strip()
        return PreprocessedDocument(
            filename=filename,
            content_type=content_type,
            kind="pdf_text",
            text=_truncate(text, max_chars),
            page_count=len(reader.pages),
            warning=None
            if text
            else (
                "No selectable text was extracted. The assistant may need to inspect "
                "the original file."
            ),
        )

    return PreprocessedDocument(
        filename=filename,
        content_type=content_type,
        kind="unsupported_binary",
        text="",
        warning="No local text extraction is available for this file type.",
    )
