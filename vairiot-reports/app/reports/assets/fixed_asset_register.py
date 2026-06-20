"""
Fixed asset register — landscape A4.

Columns carefully proportioned for a 265mm printable width (A4 landscape - margins).
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="fixed-asset-register",
    title="Fixed asset register",
    subtitle="Complete listing of all registered assets with financial summary",
    orientation="landscape",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="assetNumber",            header="Asset #",       col_type=ColType.TEXT,     width_pct=7,   align="left"),
        ColumnDef(key="name",                   header="Name",          col_type=ColType.TEXT,     width_pct=14,  align="left"),
        ColumnDef(key="category",               header="Category",      col_type=ColType.TEXT,     width_pct=9,   align="left"),
        ColumnDef(key="site",                   header="Site",          col_type=ColType.TEXT,     width_pct=9,   align="left"),
        ColumnDef(key="location",               header="Location",      col_type=ColType.TEXT,     width_pct=8,   align="left"),
        ColumnDef(key="status",                 header="Status",        col_type=ColType.STATUS,   width_pct=5,   align="center"),
        ColumnDef(key="condition",              header="Condition",     col_type=ColType.TEXT,     width_pct=5,   align="center"),
        ColumnDef(key="serialNumber",           header="Serial #",      col_type=ColType.TEXT,     width_pct=8,   align="left"),
        ColumnDef(key="purchaseDate",           header="Purchase date", col_type=ColType.DATE,     width_pct=7,   align="center"),
        ColumnDef(key="purchaseCost",           header="Purchase cost", col_type=ColType.CURRENCY, width_pct=7,   align="right"),
        ColumnDef(key="capitalizedCost",        header="Capitalised",   col_type=ColType.CURRENCY, width_pct=7,   align="right"),
        ColumnDef(key="accumulatedDepreciation", header="Accum. depr.", col_type=ColType.CURRENCY, width_pct=7,   align="right"),
        ColumnDef(key="netBookValue",           header="NBV",           col_type=ColType.CURRENCY, width_pct=7,   align="right"),
    ],
    summary_fields=[
        {"key": "totalCost",         "label": "Total cost",         "type": ColType.CURRENCY},
        {"key": "totalCapitalized",  "label": "Total capitalised",  "type": ColType.CURRENCY},
        {"key": "totalDepreciation", "label": "Accum. depreciation", "type": ColType.CURRENCY},
        {"key": "totalNBV",          "label": "Net book value",     "type": ColType.CURRENCY},
    ],
))
