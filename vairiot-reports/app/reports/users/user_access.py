from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="user-access-report",
    title="User access report",
    subtitle="User permissions and role assignments",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="name",          header="Name",          col_type=ColType.TEXT, width_pct=14, align="left"),
        ColumnDef(key="email",         header="Email",         col_type=ColType.TEXT, width_pct=18, align="left"),
        ColumnDef(key="roles",         header="Roles",         col_type=ColType.TEXT, width_pct=16, align="left"),
        ColumnDef(key="permissions",   header="Permissions",   col_type=ColType.TEXT, width_pct=24, align="left"),
        ColumnDef(key="overrides",     header="Overrides",     col_type=ColType.TEXT, width_pct=14, align="left"),
        ColumnDef(key="active",        header="Active",        col_type=ColType.TEXT, width_pct=6,  align="center"),
        ColumnDef(key="lastLoginAt",   header="Last login",    col_type=ColType.DATE, width_pct=8,  align="center"),
    ],
    summary_fields=[
        {"key": "totalUsers",       "label": "Total users",    "type": ColType.INTEGER},
        {"key": "usersWithOverrides","label": "With overrides", "type": ColType.INTEGER},
    ],
))
