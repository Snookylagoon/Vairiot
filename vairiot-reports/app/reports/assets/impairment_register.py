"""
Impairment register — landscape A4 (Phase 2, S2.4).

Every posted impairment, reversal of one and correction (IPSAS 21 / 26):
the carrying amount it was measured against, the recoverable amount and
how it was measured, the loss (negative for a reversal) and who posted it.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="impairment-register",
    title="Impairment register",
    subtitle="Posted impairments and their reversals, IPSAS 21 and 26",
    orientation="landscape",
    show_totals=True,
    totals_label="Net impairment",
    columns=[
        ColumnDef(key="period",            header="Period",          col_type=ColType.TEXT,     width_pct=7,  align="left"),
        ColumnDef(key="assetNumber",       header="Asset",           col_type=ColType.TEXT,     width_pct=10, align="left"),
        ColumnDef(key="assetName",         header="Name",            col_type=ColType.TEXT,     width_pct=15, align="left"),
        ColumnDef(key="classCode",         header="Class",           col_type=ColType.TEXT,     width_pct=5,  align="left"),
        ColumnDef(key="kind",              header="Kind",            col_type=ColType.TEXT,     width_pct=9,  align="left"),
        ColumnDef(key="indicator",         header="Indicator",       col_type=ColType.TEXT,     width_pct=9,  align="left"),
        ColumnDef(key="standard",          header="Standard",        col_type=ColType.TEXT,     width_pct=7,  align="left"),
        ColumnDef(key="method",            header="Method",          col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="carryingAmount",    header="Carrying amount", col_type=ColType.CURRENCY, width_pct=8,  align="right"),
        ColumnDef(key="recoverableAmount", header="Recoverable",     col_type=ColType.CURRENCY, width_pct=8,  align="right"),
        ColumnDef(key="loss",              header="Loss",            col_type=ColType.CURRENCY, width_pct=7,  align="right"),
        ColumnDef(key="postedBy",          header="Posted by",       col_type=ColType.TEXT,     width_pct=7,  align="left"),
    ],
    summary_fields=[
        {"key": "records",   "label": "Records",               "type": ColType.INTEGER},
        {"key": "losses",    "label": "Impairment losses",     "type": ColType.CURRENCY},
        {"key": "reversals", "label": "Reversals",             "type": ColType.CURRENCY},
        {"key": "net",       "label": "Net impairment",        "type": ColType.CURRENCY},
    ],
))
