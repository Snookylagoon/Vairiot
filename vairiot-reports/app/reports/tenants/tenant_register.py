from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="tenant-register",
    title="Tenant register",
    subtitle="List of all tenants and their subscription details",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="name",          header="Tenant",      col_type=ColType.TEXT,    width_pct=16, align="left"),
        ColumnDef(key="plan",          header="Plan",        col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="active",        header="Active",      col_type=ColType.TEXT,    width_pct=6,  align="center"),
        ColumnDef(key="parentTenant",  header="Parent",      col_type=ColType.TEXT,    width_pct=12, align="left"),
        ColumnDef(key="userCount",     header="Users",       col_type=ColType.INTEGER, width_pct=7,  align="center"),
        ColumnDef(key="assetCount",    header="Assets",      col_type=ColType.INTEGER, width_pct=7,  align="center"),
        ColumnDef(key="licenceStatus", header="Licence",     col_type=ColType.STATUS,  width_pct=8,  align="center"),
        ColumnDef(key="licenceTier",   header="Tier",        col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="licenceExpiry", header="Expiry",      col_type=ColType.DATE,    width_pct=10, align="center"),
        ColumnDef(key="onboarded",     header="Onboarded",   col_type=ColType.TEXT,    width_pct=8,  align="center"),
        ColumnDef(key="createdAt",     header="Created",     col_type=ColType.DATE,    width_pct=10, align="center"),
    ],
    summary_fields=[
        {"key": "totalTenants", "label": "Total tenants",  "type": ColType.INTEGER},
        {"key": "activeTenants","label": "Active tenants",  "type": ColType.INTEGER},
    ],
))
