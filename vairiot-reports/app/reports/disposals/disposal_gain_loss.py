from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="disposal-gain-loss",
    title="Disposal gain / loss summary",
    subtitle="Gain and loss analysis by disposal method",
    orientation="portrait",
    show_totals=True,
    totals_label="Grand total",
    columns=[
        ColumnDef(key="disposalMethod", header="Method",          col_type=ColType.TEXT,     width_pct=20, align="left"),
        ColumnDef(key="count",          header="Disposals",       col_type=ColType.INTEGER,  width_pct=12, align="center"),
        ColumnDef(key="totalDisposal",  header="Disposal value",  col_type=ColType.CURRENCY, width_pct=17, align="right"),
        ColumnDef(key="totalNBV",       header="NBV at disposal", col_type=ColType.CURRENCY, width_pct=17, align="right"),
        ColumnDef(key="totalGain",      header="Total gain",      col_type=ColType.CURRENCY, width_pct=17, align="right"),
        ColumnDef(key="totalLoss",      header="Total loss",      col_type=ColType.CURRENCY, width_pct=17, align="right"),
    ],
    summary_fields=[
        {"key": "netGainLoss",   "label": "Net gain / loss",   "type": ColType.CURRENCY},
        {"key": "avgGainLoss",   "label": "Avg gain / loss",   "type": ColType.CURRENCY},
        {"key": "totalDisposals","label": "Total disposals",   "type": ColType.INTEGER},
    ],
))
