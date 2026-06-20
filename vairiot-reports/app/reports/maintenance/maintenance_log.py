from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="maintenance-log",
    title="Maintenance log",
    subtitle="Complete record of all maintenance events",
    orientation="landscape",
    show_totals=True,
    columns=[
        ColumnDef(key="assetNumber",     header="Asset #",       col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="assetName",       header="Asset name",    col_type=ColType.TEXT,     width_pct=14, align="left"),
        ColumnDef(key="maintenanceType", header="Type",          col_type=ColType.TEXT,     width_pct=8,  align="center"),
        ColumnDef(key="status",          header="Status",        col_type=ColType.STATUS,   width_pct=7,  align="center"),
        ColumnDef(key="vendor",          header="Vendor",        col_type=ColType.TEXT,     width_pct=10, align="left"),
        ColumnDef(key="workOrderNumber", header="WO #",          col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="scheduledDate",   header="Scheduled",     col_type=ColType.DATE,     width_pct=8,  align="center"),
        ColumnDef(key="completedDate",   header="Completed",     col_type=ColType.DATE,     width_pct=8,  align="center"),
        ColumnDef(key="cost",            header="Cost",          col_type=ColType.CURRENCY, width_pct=9,  align="right"),
        ColumnDef(key="description",     header="Description",   col_type=ColType.TEXT,     width_pct=20, align="left"),
    ],
    summary_fields=[
        {"key": "totalEvents", "label": "Total events",  "type": ColType.INTEGER},
        {"key": "totalCost",   "label": "Total cost",    "type": ColType.CURRENCY},
        {"key": "avgCost",     "label": "Average cost",  "type": ColType.CURRENCY},
    ],
))
