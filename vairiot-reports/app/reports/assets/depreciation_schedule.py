"""
Depreciation schedule — landscape A4.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="depreciation-schedule",
    title="Depreciation schedule",
    subtitle="Asset depreciation register with monthly and accumulated figures",
    orientation="landscape",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="assetNumber",            header="Asset #",        col_type=ColType.TEXT,     width_pct=7,   align="left"),
        ColumnDef(key="name",                   header="Name",           col_type=ColType.TEXT,     width_pct=14,  align="left"),
        ColumnDef(key="category",               header="Category",       col_type=ColType.TEXT,     width_pct=8,   align="left"),
        ColumnDef(key="site",                   header="Site",           col_type=ColType.TEXT,     width_pct=8,   align="left"),
        ColumnDef(key="status",                 header="Status",         col_type=ColType.STATUS,   width_pct=5,   align="center"),
        ColumnDef(key="depreciationMethod",     header="Method",         col_type=ColType.TEXT,     width_pct=7,   align="center"),
        ColumnDef(key="usefulLifeMonths",       header="Useful life",    col_type=ColType.INTEGER,  width_pct=5,   align="center"),
        ColumnDef(key="depreciationStartDate",  header="Start date",     col_type=ColType.DATE,     width_pct=7,   align="center"),
        ColumnDef(key="capitalizedCost",        header="Capitalised",    col_type=ColType.CURRENCY, width_pct=8,   align="right"),
        ColumnDef(key="monthlyDepreciation",    header="Monthly depr.",  col_type=ColType.CURRENCY, width_pct=8,   align="right"),
        ColumnDef(key="accumulatedDepreciation", header="Accum. depr.",  col_type=ColType.CURRENCY, width_pct=8,   align="right"),
        ColumnDef(key="netBookValue",           header="NBV",            col_type=ColType.CURRENCY, width_pct=8,   align="right"),
        ColumnDef(key="residualValue",          header="Residual",       col_type=ColType.CURRENCY, width_pct=7,   align="right"),
    ],
    summary_fields=[
        {"key": "totalCapitalized",  "label": "Total capitalised",   "type": ColType.CURRENCY},
        {"key": "totalMonthly",      "label": "Total monthly depr.", "type": ColType.CURRENCY},
        {"key": "totalDepreciation", "label": "Accum. depreciation", "type": ColType.CURRENCY},
        {"key": "totalNBV",          "label": "Net book value",      "type": ColType.CURRENCY},
    ],
))
