from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="audit-reconciliation",
    title="Audit reconciliation detail",
    subtitle="Item-level reconciliation results for an audit campaign",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",       header="Asset #",          col_type=ColType.TEXT,   width_pct=9,  align="left"),
        ColumnDef(key="assetName",         header="Asset name",       col_type=ColType.TEXT,   width_pct=14, align="left"),
        ColumnDef(key="classification",    header="Classification",   col_type=ColType.STATUS, width_pct=10, align="center"),
        ColumnDef(key="expectedLocation",  header="Expected location",col_type=ColType.TEXT,   width_pct=12, align="left"),
        ColumnDef(key="foundLocation",     header="Found location",   col_type=ColType.TEXT,   width_pct=12, align="left"),
        ColumnDef(key="expectedCondition", header="Expected cond.",   col_type=ColType.TEXT,   width_pct=9,  align="center"),
        ColumnDef(key="foundCondition",    header="Found cond.",      col_type=ColType.TEXT,   width_pct=9,  align="center"),
        ColumnDef(key="tagValue",          header="Tag / barcode",    col_type=ColType.TEXT,   width_pct=10, align="left"),
        ColumnDef(key="notes",             header="Notes",            col_type=ColType.TEXT,   width_pct=15, align="left"),
    ],
    summary_fields=[
        {"key": "matched",    "label": "Matched",    "type": ColType.INTEGER},
        {"key": "missing",    "label": "Missing",    "type": ColType.INTEGER},
        {"key": "moved",      "label": "Moved",      "type": ColType.INTEGER},
        {"key": "unexpected", "label": "Unexpected",  "type": ColType.INTEGER},
    ],
))
