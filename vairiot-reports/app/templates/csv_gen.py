"""
CSV report generator.

Outputs UTF-8 with BOM for Excel compatibility.
"""

from __future__ import annotations

import csv
import io

from app.config import ReportDef
from app.models import ReportRequest
from app.templates.brand import format_value


def generate_csv(report_def: ReportDef, req: ReportRequest) -> io.BytesIO:
    text_buf = io.StringIO()
    writer = csv.writer(text_buf, quoting=csv.QUOTE_MINIMAL)

    # Header row
    writer.writerow([c.header for c in report_def.columns])

    # Data rows
    for row in req.rows:
        writer.writerow([
            format_value(row.get(c.key), c.col_type)
            for c in report_def.columns
        ])

    # Totals row (if applicable)
    if report_def.show_totals and req.totals:
        totals_row: list[str] = []
        for i, c in enumerate(report_def.columns):
            if i == 0:
                totals_row.append(report_def.totals_label)
            elif c.key in req.totals:
                totals_row.append(format_value(req.totals[c.key], c.col_type))
            else:
                totals_row.append("")
        writer.writerow(totals_row)

    # Convert to bytes with UTF-8 BOM
    out = io.BytesIO()
    out.write(b"\xef\xbb\xbf")
    out.write(text_buf.getvalue().encode("utf-8"))
    out.seek(0)
    return out
