from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="compliance-overview",
    title="Compliance overview",
    subtitle="Compliance status across asset management areas",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="area",         header="Area",               col_type=ColType.TEXT,    width_pct=16, align="left"),
        ColumnDef(key="metric",       header="Metric",             col_type=ColType.TEXT,    width_pct=20, align="left"),
        ColumnDef(key="target",       header="Target",             col_type=ColType.TEXT,    width_pct=10, align="center"),
        ColumnDef(key="actual",       header="Actual",             col_type=ColType.TEXT,    width_pct=10, align="center"),
        ColumnDef(key="compliance",   header="Status",             col_type=ColType.STATUS,  width_pct=10, align="center"),
        ColumnDef(key="pctCompliant", header="% compliant",        col_type=ColType.PERCENT, width_pct=10, align="center"),
        ColumnDef(key="notes",        header="Notes / action items",col_type=ColType.TEXT,   width_pct=24, align="left"),
    ],
    summary_fields=[
        {"key": "overallCompliance", "label": "Overall compliance", "type": ColType.PERCENT},
        {"key": "areasCompliant",    "label": "Areas compliant",    "type": ColType.INTEGER},
        {"key": "areasAtRisk",       "label": "Areas at risk",      "type": ColType.INTEGER},
    ],
))
