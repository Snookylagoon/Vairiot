"""
Asset condition report — portrait A4.

Distribution by condition (new/good/fair/poor/damaged) per site and category.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="asset-condition",
    title="Asset condition report",
    subtitle="Asset condition distribution by site and category",
    orientation="portrait",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="groupLabel",  header="Site / Category",  col_type=ColType.TEXT,    width_pct=22,  align="left"),
        ColumnDef(key="totalAssets", header="Total",            col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="new",         header="New",              col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="good",        header="Good",             col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="fair",        header="Fair",             col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="poor",        header="Poor",             col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="damaged",     header="Damaged",          col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="pctGoodOrNew", header="% Good+",         col_type=ColType.PERCENT, width_pct=18,  align="center"),
    ],
    summary_fields=[
        {"key": "totalAssets",   "label": "Total assets",    "type": ColType.INTEGER},
        {"key": "pctGood",       "label": "% Good or better", "type": ColType.PERCENT},
        {"key": "pctDamaged",    "label": "% Damaged",        "type": ColType.PERCENT},
    ],
))
