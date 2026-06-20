from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="audit-campaign-summary",
    title="Audit campaign summary",
    subtitle="Overview of all audit campaigns with completion status",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="name",          header="Campaign",       col_type=ColType.TEXT,    width_pct=16, align="left"),
        ColumnDef(key="mode",          header="Mode",           col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="status",        header="Status",         col_type=ColType.STATUS,  width_pct=8,  align="center"),
        ColumnDef(key="site",          header="Site",           col_type=ColType.TEXT,    width_pct=10, align="left"),
        ColumnDef(key="scheduledAt",   header="Scheduled",      col_type=ColType.DATE,    width_pct=8,  align="center"),
        ColumnDef(key="startedAt",     header="Started",        col_type=ColType.DATE,    width_pct=8,  align="center"),
        ColumnDef(key="completedAt",   header="Completed",      col_type=ColType.DATE,    width_pct=8,  align="center"),
        ColumnDef(key="totalAssets",   header="Assets",         col_type=ColType.INTEGER, width_pct=6,  align="center"),
        ColumnDef(key="scanned",       header="Scanned",        col_type=ColType.INTEGER, width_pct=6,  align="center"),
        ColumnDef(key="matched",       header="Matched",        col_type=ColType.INTEGER, width_pct=6,  align="center"),
        ColumnDef(key="missing",       header="Missing",        col_type=ColType.INTEGER, width_pct=6,  align="center"),
        ColumnDef(key="unexpected",    header="Unexpected",     col_type=ColType.INTEGER, width_pct=6,  align="center"),
        ColumnDef(key="accuracy",      header="Accuracy %",     col_type=ColType.PERCENT, width_pct=4,  align="center"),
    ],
    summary_fields=[
        {"key": "totalCampaigns",  "label": "Total campaigns",  "type": ColType.INTEGER},
        {"key": "avgAccuracy",     "label": "Avg accuracy",      "type": ColType.PERCENT},
        {"key": "totalScanned",    "label": "Total scanned",     "type": ColType.INTEGER},
    ],
))
