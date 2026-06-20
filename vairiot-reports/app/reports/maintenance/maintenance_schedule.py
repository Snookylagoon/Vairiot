from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="maintenance-schedule",
    title="Maintenance schedule",
    subtitle="Upcoming and overdue maintenance events",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",     header="Asset #",     col_type=ColType.TEXT,   width_pct=9,  align="left"),
        ColumnDef(key="assetName",       header="Asset name",  col_type=ColType.TEXT,   width_pct=16, align="left"),
        ColumnDef(key="maintenanceType", header="Type",        col_type=ColType.TEXT,   width_pct=10, align="center"),
        ColumnDef(key="vendor",          header="Vendor",      col_type=ColType.TEXT,   width_pct=12, align="left"),
        ColumnDef(key="workOrderNumber", header="WO #",        col_type=ColType.TEXT,   width_pct=9,  align="left"),
        ColumnDef(key="scheduledDate",   header="Scheduled",   col_type=ColType.DATE,   width_pct=10, align="center"),
        ColumnDef(key="status",          header="Status",      col_type=ColType.STATUS, width_pct=8,  align="center"),
        ColumnDef(key="daysUntilDue",    header="Days until",  col_type=ColType.INTEGER,width_pct=8,  align="center"),
        ColumnDef(key="description",     header="Description", col_type=ColType.TEXT,   width_pct=18, align="left"),
    ],
    summary_fields=[
        {"key": "overdueCount",  "label": "Overdue",    "type": ColType.INTEGER},
        {"key": "upcomingCount", "label": "Upcoming",   "type": ColType.INTEGER},
        {"key": "totalScheduled","label": "Total",      "type": ColType.INTEGER},
    ],
))
