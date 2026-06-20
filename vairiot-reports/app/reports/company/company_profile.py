from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="company-profile",
    title="Company profile report",
    subtitle="Registered company details and associated clients",
    orientation="portrait",
    show_totals=False,
    columns=[
        ColumnDef(key="field",  header="Field", col_type=ColType.TEXT, width_pct=30, align="left"),
        ColumnDef(key="value",  header="Value", col_type=ColType.TEXT, width_pct=70, align="left"),
    ],
    summary_fields=[],
))
