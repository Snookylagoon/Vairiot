from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="tenant-activity",
    title="Tenant activity summary",
    subtitle="Activity metrics by tenant",
    orientation="landscape",
    show_totals=True,
    totals_label="Total",
    columns=[
        ColumnDef(key="name",            header="Tenant",       col_type=ColType.TEXT,    width_pct=16, align="left"),
        ColumnDef(key="assetCount",      header="Assets",       col_type=ColType.INTEGER, width_pct=8,  align="center"),
        ColumnDef(key="userCount",       header="Users",        col_type=ColType.INTEGER, width_pct=8,  align="center"),
        ColumnDef(key="auditCount",      header="Audits",       col_type=ColType.INTEGER, width_pct=8,  align="center"),
        ColumnDef(key="checkoutCount",   header="Checkouts",    col_type=ColType.INTEGER, width_pct=8,  align="center"),
        ColumnDef(key="maintenanceCount",header="Maintenance",  col_type=ColType.INTEGER, width_pct=9,  align="center"),
        ColumnDef(key="disposalCount",   header="Disposals",    col_type=ColType.INTEGER, width_pct=8,  align="center"),
        ColumnDef(key="totalAssetValue", header="Asset value",  col_type=ColType.CURRENCY,width_pct=12, align="right"),
        ColumnDef(key="lastActivity",    header="Last activity",col_type=ColType.DATE,    width_pct=10, align="center"),
        ColumnDef(key="plan",            header="Plan",         col_type=ColType.TEXT,    width_pct=7,  align="center"),
        ColumnDef(key="active",          header="Active",       col_type=ColType.TEXT,    width_pct=6,  align="center"),
    ],
    summary_fields=[
        {"key": "totalAssets",    "label": "Total assets",      "type": ColType.INTEGER},
        {"key": "totalUsers",     "label": "Total users",       "type": ColType.INTEGER},
        {"key": "totalValue",     "label": "Total asset value",  "type": ColType.CURRENCY},
    ],
))
