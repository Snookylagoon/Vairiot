from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="audit-scan-log",
    title="Audit scan log",
    subtitle="Chronological log of all scans in an audit campaign",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="scannedAt",  header="Timestamp",    col_type=ColType.DATE,   width_pct=12, align="center"),
        ColumnDef(key="tagValue",   header="Tag / barcode",col_type=ColType.TEXT,    width_pct=14, align="left"),
        ColumnDef(key="assetNumber",header="Asset #",      col_type=ColType.TEXT,    width_pct=10, align="left"),
        ColumnDef(key="assetName",  header="Asset name",   col_type=ColType.TEXT,    width_pct=16, align="left"),
        ColumnDef(key="result",     header="Result",       col_type=ColType.STATUS,  width_pct=10, align="center"),
        ColumnDef(key="location",   header="Location",     col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="condition",  header="Condition",    col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="scannedBy",  header="Scanned by",   col_type=ColType.TEXT,    width_pct=10, align="left"),
        ColumnDef(key="device",     header="Device",       col_type=ColType.TEXT,    width_pct=8,  align="left"),
    ],
    summary_fields=[
        {"key": "totalScans",    "label": "Total scans",    "type": ColType.INTEGER},
        {"key": "matchedScans",  "label": "Matched",        "type": ColType.INTEGER},
        {"key": "unknownScans",  "label": "Unknown tags",   "type": ColType.INTEGER},
    ],
))
