"""
Asset valuation summary — portrait A4.

Aggregated totals by category/site: original cost, capitalised cost,
accumulated depreciation, net book value.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="asset-valuation-summary",
    title="Asset valuation summary",
    subtitle="Aggregated asset values by category and site",
    orientation="portrait",
    show_totals=True,
    totals_label="Grand total",
    columns=[
        ColumnDef(key="groupLabel",             header="Group",             col_type=ColType.TEXT,     width_pct=22,  align="left"),
        ColumnDef(key="assetCount",             header="Assets",            col_type=ColType.INTEGER,  width_pct=8,   align="center"),
        ColumnDef(key="totalPurchaseCost",      header="Purchase cost",     col_type=ColType.CURRENCY, width_pct=14,  align="right"),
        ColumnDef(key="totalCapitalizedCost",   header="Capitalised cost",  col_type=ColType.CURRENCY, width_pct=14,  align="right"),
        ColumnDef(key="totalDepreciation",      header="Accum. depr.",      col_type=ColType.CURRENCY, width_pct=14,  align="right"),
        ColumnDef(key="totalNBV",               header="Net book value",    col_type=ColType.CURRENCY, width_pct=14,  align="right"),
        ColumnDef(key="avgAge",                 header="Avg. age (months)", col_type=ColType.NUMBER,   width_pct=14,  align="center"),
    ],
    summary_fields=[
        {"key": "grandTotalCost",         "label": "Total cost",          "type": ColType.CURRENCY},
        {"key": "grandTotalNBV",          "label": "Total NBV",           "type": ColType.CURRENCY},
        {"key": "grandTotalDepreciation", "label": "Total depreciation",  "type": ColType.CURRENCY},
        {"key": "totalAssetCount",        "label": "Total assets",        "type": ColType.INTEGER},
    ],
))
