from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="licence-register",
    title="Licence register",
    subtitle="Complete record of all licences",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="licenceNumber",  header="Licence #",    col_type=ColType.TEXT,     width_pct=12, align="left"),
        ColumnDef(key="tier",           header="Tier",         col_type=ColType.TEXT,     width_pct=10, align="center"),
        ColumnDef(key="status",         header="Status",       col_type=ColType.STATUS,   width_pct=8,  align="center"),
        ColumnDef(key="activatedAt",    header="Activated",    col_type=ColType.DATE,     width_pct=10, align="center"),
        ColumnDef(key="expiresAt",      header="Expires",      col_type=ColType.DATE,     width_pct=10, align="center"),
        ColumnDef(key="durationMonths", header="Duration (m)", col_type=ColType.INTEGER,  width_pct=8,  align="center"),
        ColumnDef(key="maxAssets",      header="Max assets",   col_type=ColType.INTEGER,  width_pct=8,  align="center"),
        ColumnDef(key="devicesUsed",    header="Devices used", col_type=ColType.INTEGER,  width_pct=8,  align="center"),
        ColumnDef(key="baseDevices",    header="Base devices", col_type=ColType.INTEGER,  width_pct=8,  align="center"),
        ColumnDef(key="pricePerYear",   header="Price / yr",   col_type=ColType.CURRENCY, width_pct=10, align="right"),
        ColumnDef(key="paymentStatus",  header="Payment",      col_type=ColType.TEXT,     width_pct=8,  align="center"),
    ],
    summary_fields=[
        {"key": "totalLicences", "label": "Total licences", "type": ColType.INTEGER},
        {"key": "activeLicences","label": "Active",          "type": ColType.INTEGER},
        {"key": "expiredCount",  "label": "Expired",         "type": ColType.INTEGER},
    ],
))
