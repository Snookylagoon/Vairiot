from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="alert-subscriptions",
    title="Alert subscriptions",
    subtitle="Active alert subscription configuration",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="userName",       header="User",            col_type=ColType.TEXT,   width_pct=16, align="left"),
        ColumnDef(key="email",          header="Email",           col_type=ColType.TEXT,   width_pct=18, align="left"),
        ColumnDef(key="exceptionType",  header="Exception type",  col_type=ColType.TEXT,   width_pct=16, align="left"),
        ColumnDef(key="channel",        header="Channel",         col_type=ColType.TEXT,   width_pct=10, align="center"),
        ColumnDef(key="frequency",      header="Frequency",       col_type=ColType.TEXT,   width_pct=10, align="center"),
        ColumnDef(key="active",         header="Active",          col_type=ColType.TEXT,   width_pct=8,  align="center"),
        ColumnDef(key="lastSentAt",     header="Last sent",       col_type=ColType.DATE,   width_pct=12, align="center"),
        ColumnDef(key="createdAt",      header="Created",         col_type=ColType.DATE,   width_pct=10, align="center"),
    ],
    summary_fields=[
        {"key": "totalSubs",   "label": "Total subscriptions", "type": ColType.INTEGER},
        {"key": "activeSubs",  "label": "Active",               "type": ColType.INTEGER},
    ],
))
