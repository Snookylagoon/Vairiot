from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="user-activity-log",
    title="User activity log",
    subtitle="Audit trail of user actions",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="occurredAt",  header="Timestamp",    col_type=ColType.DATE,   width_pct=12, align="center"),
        ColumnDef(key="actorName",   header="User",         col_type=ColType.TEXT,   width_pct=12, align="left"),
        ColumnDef(key="action",      header="Action",       col_type=ColType.TEXT,   width_pct=10, align="left"),
        ColumnDef(key="entityType",  header="Entity type",  col_type=ColType.TEXT,   width_pct=10, align="left"),
        ColumnDef(key="entityId",    header="Entity ID",    col_type=ColType.TEXT,   width_pct=12, align="left"),
        ColumnDef(key="fieldChanged",header="Field",        col_type=ColType.TEXT,   width_pct=10, align="left"),
        ColumnDef(key="valueBefore", header="Before",       col_type=ColType.TEXT,   width_pct=14, align="left"),
        ColumnDef(key="valueAfter",  header="After",        col_type=ColType.TEXT,   width_pct=14, align="left"),
        ColumnDef(key="metadata",    header="Metadata",     col_type=ColType.TEXT,   width_pct=6,  align="left"),
    ],
    summary_fields=[
        {"key": "totalEvents",  "label": "Total events",   "type": ColType.INTEGER},
        {"key": "uniqueUsers",  "label": "Unique users",   "type": ColType.INTEGER},
    ],
))
