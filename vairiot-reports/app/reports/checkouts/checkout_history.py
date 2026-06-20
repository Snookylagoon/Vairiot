from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="checkout-history-by-asset",
    title="Checkout history by asset",
    subtitle="Checkout frequency and duration analysis per asset",
    orientation="landscape",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="assetNumber",     header="Asset #",      col_type=ColType.TEXT,    width_pct=10, align="left"),
        ColumnDef(key="assetName",       header="Asset name",   col_type=ColType.TEXT,    width_pct=20, align="left"),
        ColumnDef(key="category",        header="Category",     col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="totalCheckouts",  header="Checkouts",    col_type=ColType.INTEGER, width_pct=10, align="center"),
        ColumnDef(key="avgDaysOut",      header="Avg days out", col_type=ColType.TEXT,    width_pct=12, align="center"),
        ColumnDef(key="maxDaysOut",      header="Max days out", col_type=ColType.INTEGER, width_pct=12, align="center"),
        ColumnDef(key="currentlyOut",    header="Currently out",col_type=ColType.TEXT,    width_pct=10, align="center"),
        ColumnDef(key="lastCheckoutDate",header="Last checkout", col_type=ColType.DATE,   width_pct=14, align="center"),
    ],
    summary_fields=[
        {"key": "totalAssets",    "label": "Assets checked out",  "type": ColType.INTEGER},
        {"key": "totalCheckouts", "label": "Total checkouts",     "type": ColType.INTEGER},
    ],
))
