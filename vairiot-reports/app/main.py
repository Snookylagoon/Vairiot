"""
Vairiot Report Service — FastAPI application.

Accepts JSON payloads with report data and returns generated files
in CSV, XLSX, DOCX, or PDF format.
"""

from __future__ import annotations

import io

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

import copy

from app.config import ColumnDef
from app.models import ReportRequest
from app.reports import get_report_def
from app.templates.csv_gen import generate_csv
from app.templates.xlsx import generate_xlsx
from app.templates.docx_gen import generate_docx
from app.templates.pdf_gen import generate_pdf

app = FastAPI(
    title="Vairiot Report Service",
    version="1.0.0",
    docs_url="/docs",
)


CONTENT_TYPES = {
    "csv":  "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf":  "application/pdf",
}

EXTENSIONS = {
    "csv": ".csv",
    "xlsx": ".xlsx",
    "docx": ".docx",
    "pdf": ".pdf",
}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "vairiot-reports"}


@app.post("/generate")
async def generate_report(req: ReportRequest):
    report_def = get_report_def(req.report_type)
    if report_def is None:
        raise HTTPException(status_code=400, detail=f"Unknown report type: {req.report_type}")

    if req.extra_columns:
        report_def = copy.deepcopy(report_def)
        for ec in req.extra_columns:
            report_def.columns.append(ColumnDef(
                key=ec["key"],
                header=ec["header"],
                col_type=ec.get("col_type", "text"),
                width_pct=ec.get("width_pct", 10),
                align=ec.get("align", "left"),
            ))

    if req.format not in CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {req.format}")

    generators = {
        "csv":  generate_csv,
        "xlsx": generate_xlsx,
        "docx": generate_docx,
        "pdf":  generate_pdf,
    }

    buf: io.BytesIO = generators[req.format](report_def, req)

    filename = f"{report_def.report_id}{EXTENSIONS[req.format]}"

    return StreamingResponse(
        buf,
        media_type=CONTENT_TYPES[req.format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
