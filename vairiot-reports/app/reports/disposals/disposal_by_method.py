from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="disposal-by-method",
    title="Disposals by method",
    subtitle="Disposal count and value breakdown by method",
    orientation="portrait",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="disposalMethod", header="Method",     col_type=ColType.TEXT,     width_pct=25, align="left"),
        ColumnDef(key="count",          header="Count",      col_type=ColType.INTEGER,  width_pct=15, align="center"),
        ColumnDef(key="totalValue",     header="Total value", col_type=ColType.CURRENCY, width_pct=20, align="right"),
        ColumnDef(key="avgValue",       header="Avg value",   col_type=ColType.CURRENCY, width_pct=20, align="right"),
        ColumnDef(key="pctOfTotal",     header="% of total",  col_type=ColType.PERCENT,  width_pct=20, align="center"),
    ],
    summary_fields=[
        {"key": "totalDisposals", "label": "Total disposals", "type": ColType.INTEGER},
        {"key": "totalValue",     "label": "Total value",     "type": ColType.CURRENCY},
    ],
))
