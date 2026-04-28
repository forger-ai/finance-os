"""Convert an .xlsx workbook into a CSV string the importer already understands.

Strategy: read the active sheet, stringify every cell (dates → ISO, numbers as
plain decimals), and emit CSV. We skip leading "title" rows (rows where fewer
than two cells have content) so a bank export with a banner row still works.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time
from typing import Any

import openpyxl


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, float):
        # Avoid scientific notation; trim trailing zeros so "1500.0" → "1500".
        formatted = f"{value:.10f}".rstrip("0").rstrip(".")
        return formatted or "0"
    return str(value)


def xlsx_to_csv(data: bytes) -> str:
    """Return the active sheet of ``data`` as CSV text.

    - Drops empty rows.
    - Drops leading "banner" rows (rows with fewer than 2 non-empty cells)
      until the first plausible header row is reached.
    """
    workbook = openpyxl.load_workbook(
        io.BytesIO(data),
        data_only=True,
        read_only=True,
    )
    sheet = workbook.active
    if sheet is None:
        return ""

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    header_seen = False
    for raw_row in sheet.iter_rows(values_only=True):
        cells = [_stringify(cell) for cell in raw_row]
        non_empty = sum(1 for c in cells if c.strip() != "")
        if non_empty == 0:
            continue
        if not header_seen:
            if non_empty < 2:
                # Single-cell title row, e.g. "Estado de cuenta abril 2026".
                continue
            header_seen = True
        writer.writerow(cells)

    return buffer.getvalue()
