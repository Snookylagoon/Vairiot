from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="licence-expiry",
    title="Licence expiry report",
    subtitle="Licences approaching or past expiry",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="licenceNumber",  header="Licence #",  col_type=ColType.TEXT,    width_pct=14, align="left"),
        ColumnDef(key="tier",           header="Tier",       col_type=ColType.TEXT,    width_pct=10, align="center"),
        ColumnDef(key="status",         header="Status",     col_type=ColType.STATUS,  width_pct=10, align="center"),
        ColumnDef(key="expiresAt",      header="Expires",    col_type=ColType.DATE,    width_pct=12, align="center"),
        ColumnDef(key="daysRemaining",  header="Days left",  col_type=ColType.INTEGER, width_pct=10, align="center"),
        ColumnDef(key="gracePeriodDays",header="Grace (d)",  col_type=ColType.INTEGER, width_pct=10, align="center"),
        ColumnDef(key="tenant",         header="Tenant",     col_type=ColType.TEXT,    width_pct=14, align="left"),
        ColumnDef(key="maxAssets",      header="Max assets", col_type=ColType.INTEGER, width_pct=10, align="center"),
        ColumnDef(key="pricePerYear",   header="Price / yr", col_type=ColType.CURRENCY,width_pct=10, align="right"),
    ],
    summary_fields=[
        {"key": "expiringCount", "label": "Expiring soon",  "type": ColType.INTEGER},
        {"key": "expiredCount",  "label": "Expired",         "type": ColType.INTEGER},
        {"key": "totalRevenue",  "label": "Revenue at risk", "type": ColType.CURRENCY},
    ],
))
