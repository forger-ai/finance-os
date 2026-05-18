"""Convert a legacy .xls workbook into CSV text the importer already understands.

Strategy: read the first sheet, stringify every cell (dates -> ISO, numbers as
plain decimals), and emit CSV. We skip leading "title" rows (rows where fewer
than two cells have content) so a bank export with a banner row still works.
"""

from __future__ import annotations

import csv
import io
from typing import Any

import xlrd


def _stringify(value: Any, *, datemode: int, cell_type: int) -> str:
    if value in (None, ""):
        return ""
    if cell_type == xlrd.XL_CELL_DATE:
        return xlrd.xldate_as_datetime(value, datemode).isoformat()
    if isinstance(value, float):
        # Avoid scientific notation; trim trailing zeros so "1500.0" -> "1500".
        formatted = f"{value:.10f}".rstrip("0").rstrip(".")
        return formatted or "0"
    return str(value)


def xls_to_csv(data: bytes) -> str:
    """Return the first sheet of ``data`` as CSV text.

    - Drops empty rows.
    - Drops leading "banner" rows (rows with fewer than 2 non-empty cells)
      until the first plausible header row is reached.
    """
    workbook = xlrd.open_workbook(file_contents=data)
    if workbook.nsheets == 0:
        return ""
    sheet = workbook.sheet_by_index(0)

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    header_seen = False
    for row_index in range(sheet.nrows):
        cells = [
            _stringify(cell.value, datemode=workbook.datemode, cell_type=cell.ctype)
            for cell in sheet.row(row_index)
        ]
        non_empty = sum(1 for cell in cells if cell.strip() != "")
        if non_empty == 0:
            continue
        if not header_seen:
            if non_empty < 2:
                continue
            header_seen = True
        writer.writerow(cells)

    return buffer.getvalue()
