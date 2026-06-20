from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="maintenance-cost-summary",
    title="Maintenance cost summary",
    subtitle="Maintenance expenditure by type and vendor",
    orientation="portrait",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="maintenanceType", header="Type",       col_type=ColType.TEXT,     width_pct=18, align="left"),
        ColumnDef(key="vendor",          header="Vendor",     col_type=ColType.TEXT,     width_pct=18, align="left"),
        ColumnDef(key="eventCount",      header="Events",     col_type=ColType.INTEGER,  width_pct=12, align="center"),
        ColumnDef(key="totalCost",       header="Total cost", col_type=ColType.CURRENCY, width_pct=17, align="right"),
        ColumnDef(key="avgCost",         header="Avg cost",   col_type=ColType.CURRENCY, width_pct=17, align="right"),
        ColumnDef(key="pctOfTotal",      header="% of total", col_type=ColType.PERCENT,  width_pct=18, align="center"),
    ],
    summary_fields=[
        {"key": "grandTotal",   "label": "Grand total",   "type": ColType.CURRENCY},
        {"key": "totalEvents",  "label": "Total events",  "type": ColType.INTEGER},
    ],
))
