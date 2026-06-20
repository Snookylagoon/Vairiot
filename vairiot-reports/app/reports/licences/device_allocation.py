from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="device-allocation",
    title="Device allocation report",
    subtitle="Device usage and allocation by licence",
    orientation="landscape",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="licenceNumber", header="Licence #",      col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="tier",          header="Tier",           col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="deviceName",    header="Device name",    col_type=ColType.TEXT,    width_pct=14, align="left"),
        ColumnDef(key="deviceType",    header="Type",           col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="serialNumber",  header="Serial #",       col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="userName",      header="User",           col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="active",        header="Active",         col_type=ColType.TEXT,    width_pct=6,  align="center"),
        ColumnDef(key="activatedAt",   header="Activated",      col_type=ColType.DATE,    width_pct=10, align="center"),
        ColumnDef(key="lastSeenAt",    header="Last seen",      col_type=ColType.DATE,    width_pct=10, align="center"),
        ColumnDef(key="status",        header="Licence status", col_type=ColType.STATUS,  width_pct=8,  align="center"),
    ],
    summary_fields=[
        {"key": "totalDevices",  "label": "Total devices",  "type": ColType.INTEGER},
        {"key": "activeDevices", "label": "Active devices",  "type": ColType.INTEGER},
    ],
))
