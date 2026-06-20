"""
Asset aging report — portrait A4.

Fewer columns, portrait works well. Includes age bucket distribution as summary.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="asset-aging",
    title="Asset aging report",
    subtitle="Asset age distribution with purchase date and cost analysis",
    orientation="portrait",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",  header="Asset #",       col_type=ColType.TEXT,     width_pct=12,  align="left"),
        ColumnDef(key="name",         header="Name",           col_type=ColType.TEXT,     width_pct=22,  align="left"),
        ColumnDef(key="category",     header="Category",       col_type=ColType.TEXT,     width_pct=14,  align="left"),
        ColumnDef(key="site",         header="Site",           col_type=ColType.TEXT,     width_pct=14,  align="left"),
        ColumnDef(key="status",       header="Status",         col_type=ColType.STATUS,   width_pct=8,   align="center"),
        ColumnDef(key="purchaseDate", header="Purchase date",  col_type=ColType.DATE,     width_pct=12,  align="center"),
        ColumnDef(key="purchaseCost", header="Purchase cost",  col_type=ColType.CURRENCY, width_pct=10,  align="right"),
        ColumnDef(key="ageMonths",    header="Age (months)",   col_type=ColType.INTEGER,  width_pct=8,   align="center"),
    ],
    summary_fields=[
        {"key": "totalAssets", "label": "Total assets",  "type": ColType.INTEGER},
        {"key": "0-1y",        "label": "0–1 year",      "type": ColType.INTEGER},
        {"key": "1-3y",        "label": "1–3 years",     "type": ColType.INTEGER},
        {"key": "3-5y",        "label": "3–5 years",     "type": ColType.INTEGER},
        {"key": "5-10y",       "label": "5–10 years",    "type": ColType.INTEGER},
        {"key": "10y+",        "label": "10+ years",     "type": ColType.INTEGER},
    ],
))
