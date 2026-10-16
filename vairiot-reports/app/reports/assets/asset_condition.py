"""
Asset condition report — portrait A4.

Distribution by condition grade (5 Excellent … 1 Unserviceable) per site and
category. The column keys stay the condition strings, one per grade (stage 1.16).
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="asset-condition",
    title="Asset condition report",
    subtitle="Condition grade distribution by site and category",
    orientation="portrait",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="groupLabel",  header="Site / Category",  col_type=ColType.TEXT,    width_pct=22,  align="left"),
        ColumnDef(key="totalAssets", header="Total",            col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="new",         header="5 Excellent",      col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="good",        header="4 Good",           col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="fair",        header="3 Fair",           col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="poor",        header="2 Poor",           col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="damaged",     header="1 Unserviceable",  col_type=ColType.INTEGER, width_pct=10,  align="center"),
        ColumnDef(key="pctGoodOrNew", header="% Grade 4+",      col_type=ColType.PERCENT, width_pct=18,  align="center"),
    ],
    summary_fields=[
        {"key": "totalAssets",   "label": "Total assets",    "type": ColType.INTEGER},
        {"key": "pctGood",       "label": "% Grade 4 or better", "type": ColType.PERCENT},
        {"key": "pctDamaged",    "label": "% Unserviceable",        "type": ColType.PERCENT},
    ],
))
