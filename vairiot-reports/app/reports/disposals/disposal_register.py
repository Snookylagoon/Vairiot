from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="disposal-register",
    title="Disposal register",
    subtitle="Complete record of all asset disposals",
    orientation="landscape",
    show_totals=True,
    columns=[
        ColumnDef(key="assetNumber",            header="Asset #",        col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="assetName",              header="Asset name",     col_type=ColType.TEXT,     width_pct=14, align="left"),
        ColumnDef(key="category",               header="Category",       col_type=ColType.TEXT,     width_pct=10, align="left"),
        ColumnDef(key="site",                   header="Site",           col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="disposalDate",           header="Date",           col_type=ColType.DATE,     width_pct=8,  align="center"),
        ColumnDef(key="disposalMethod",         header="Method",         col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="disposalValue",          header="Disposal value", col_type=ColType.CURRENCY, width_pct=10, align="right"),
        ColumnDef(key="netBookValueAtDisposal", header="NBV at disposal",col_type=ColType.CURRENCY, width_pct=10, align="right"),
        ColumnDef(key="gainLoss",               header="Gain / Loss",    col_type=ColType.CURRENCY, width_pct=10, align="right"),
        ColumnDef(key="reason",                 header="Reason",         col_type=ColType.TEXT,     width_pct=8,  align="left"),
        ColumnDef(key="approvedBy",             header="Approved by",    col_type=ColType.TEXT,     width_pct=6,  align="left"),
    ],
    summary_fields=[
        {"key": "totalDisposals",     "label": "Total disposals",     "type": ColType.INTEGER},
        {"key": "totalDisposalValue", "label": "Total disposal value", "type": ColType.CURRENCY},
        {"key": "totalNBV",           "label": "Total NBV",            "type": ColType.CURRENCY},
        {"key": "totalGainLoss",      "label": "Net gain / loss",      "type": ColType.CURRENCY},
    ],
))
