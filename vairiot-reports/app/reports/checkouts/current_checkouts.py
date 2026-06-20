from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="current-checkouts",
    title="Currently checked-out assets",
    subtitle="Assets currently assigned to custodians",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",    header="Asset #",        col_type=ColType.TEXT, width_pct=10, align="left"),
        ColumnDef(key="assetName",      header="Asset name",     col_type=ColType.TEXT, width_pct=18, align="left"),
        ColumnDef(key="category",       header="Category",       col_type=ColType.TEXT, width_pct=10, align="left"),
        ColumnDef(key="custodian",      header="Custodian",      col_type=ColType.TEXT, width_pct=14, align="left"),
        ColumnDef(key="checkedOutBy",   header="Checked out by", col_type=ColType.TEXT, width_pct=12, align="left"),
        ColumnDef(key="checkedOutAt",   header="Checked out",    col_type=ColType.DATE, width_pct=10, align="center"),
        ColumnDef(key="expectedReturn", header="Expected return", col_type=ColType.DATE,width_pct=10, align="center"),
        ColumnDef(key="daysOut",        header="Days out",       col_type=ColType.INTEGER,width_pct=6, align="center"),
        ColumnDef(key="overdue",        header="Overdue",        col_type=ColType.TEXT, width_pct=6,  align="center"),
        ColumnDef(key="notes",          header="Notes",          col_type=ColType.TEXT, width_pct=4,  align="left"),
    ],
    summary_fields=[
        {"key": "totalOut",     "label": "Total checked out", "type": ColType.INTEGER},
        {"key": "overdueCount", "label": "Overdue",           "type": ColType.INTEGER},
    ],
))
