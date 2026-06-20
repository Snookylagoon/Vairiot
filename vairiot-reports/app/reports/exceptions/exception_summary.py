from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="exception-summary",
    title="Exception summary",
    subtitle="Overview of current exceptions and alerts",
    orientation="landscape",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="exceptionType", header="Exception type",col_type=ColType.TEXT,    width_pct=18, align="left"),
        ColumnDef(key="severity",      header="Severity",      col_type=ColType.STATUS,  width_pct=10, align="center"),
        ColumnDef(key="count",         header="Count",         col_type=ColType.INTEGER, width_pct=10, align="center"),
        ColumnDef(key="entityType",    header="Entity type",   col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="description",   header="Description",   col_type=ColType.TEXT,    width_pct=30, align="left"),
        ColumnDef(key="firstOccurred", header="First occurred",col_type=ColType.DATE,    width_pct=10, align="center"),
        ColumnDef(key="lastOccurred",  header="Last occurred", col_type=ColType.DATE,    width_pct=10, align="center"),
    ],
    summary_fields=[
        {"key": "totalExceptions",  "label": "Total exceptions", "type": ColType.INTEGER},
        {"key": "criticalCount",    "label": "Critical",          "type": ColType.INTEGER},
    ],
))
