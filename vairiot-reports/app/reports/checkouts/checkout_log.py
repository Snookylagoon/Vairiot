from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="checkout-log",
    title="Checkout log",
    subtitle="Complete record of all asset checkouts and returns",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",   header="Asset #",       col_type=ColType.TEXT, width_pct=9,  align="left"),
        ColumnDef(key="assetName",     header="Asset name",    col_type=ColType.TEXT, width_pct=14, align="left"),
        ColumnDef(key="custodian",     header="Custodian",     col_type=ColType.TEXT, width_pct=12, align="left"),
        ColumnDef(key="checkedOutBy",  header="Checked out by",col_type=ColType.TEXT, width_pct=10, align="left"),
        ColumnDef(key="checkedOutAt",  header="Checked out",   col_type=ColType.DATE, width_pct=10, align="center"),
        ColumnDef(key="expectedReturn",header="Expected return",col_type=ColType.DATE,width_pct=10, align="center"),
        ColumnDef(key="checkedInAt",   header="Returned",      col_type=ColType.DATE, width_pct=10, align="center"),
        ColumnDef(key="checkedInBy",   header="Checked in by", col_type=ColType.TEXT, width_pct=10, align="left"),
        ColumnDef(key="status",        header="Status",        col_type=ColType.STATUS,width_pct=7, align="center"),
        ColumnDef(key="notes",         header="Notes",         col_type=ColType.TEXT, width_pct=8,  align="left"),
    ],
    summary_fields=[
        {"key": "totalCheckouts",  "label": "Total checkouts",    "type": ColType.INTEGER},
        {"key": "currentlyOut",    "label": "Currently out",       "type": ColType.INTEGER},
        {"key": "overdueCount",    "label": "Overdue",             "type": ColType.INTEGER},
    ],
))
