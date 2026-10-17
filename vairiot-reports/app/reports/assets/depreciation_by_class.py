"""
Depreciation by asset class — portrait A4 (Phase 2, S2.3).

For one posted period: each IPSAS asset class's charge that month, its
accumulated depreciation to the end of it, the impairment posted up to it
(stage 2.12), its cost and carrying amount.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="depreciation-by-class",
    title="Depreciation by asset class",
    subtitle="Posted depreciation for the period, accumulated depreciation and carrying amount by class",
    orientation="portrait",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="classCode",      header="Class",          col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="className",      header="Name",           col_type=ColType.TEXT,     width_pct=20, align="left"),
        ColumnDef(key="assetCount",     header="Assets",         col_type=ColType.INTEGER,  width_pct=7,  align="center"),
        ColumnDef(key="periodCharge",   header="Charge",         col_type=ColType.CURRENCY, width_pct=12, align="right"),
        ColumnDef(key="accumulated",    header="Accum. depr.",   col_type=ColType.CURRENCY, width_pct=13, align="right"),
        ColumnDef(key="impaired",       header="Impairment",     col_type=ColType.CURRENCY, width_pct=12, align="right"),
        ColumnDef(key="cost",           header="Cost",           col_type=ColType.CURRENCY, width_pct=13, align="right"),
        ColumnDef(key="carryingAmount", header="Carrying amount", col_type=ColType.CURRENCY, width_pct=15, align="right"),
    ],
    summary_fields=[
        {"key": "period",        "label": "Period",              "type": ColType.TEXT},
        {"key": "totalCharge",   "label": "Charge for the period", "type": ColType.CURRENCY},
        {"key": "totalCarrying", "label": "Carrying amount",     "type": ColType.CURRENCY},
    ],
))
