from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

register(ReportDef(
    report_id="user-register",
    title="User register",
    subtitle="Complete list of all users and their roles",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="name",            header="Name",          col_type=ColType.TEXT,   width_pct=14, align="left"),
        ColumnDef(key="email",           header="Email",         col_type=ColType.TEXT,   width_pct=18, align="left"),
        ColumnDef(key="phone",           header="Phone",         col_type=ColType.TEXT,   width_pct=10, align="left"),
        ColumnDef(key="roles",           header="Roles",         col_type=ColType.TEXT,   width_pct=14, align="left"),
        ColumnDef(key="active",          header="Active",        col_type=ColType.TEXT,   width_pct=6,  align="center"),
        ColumnDef(key="twoFactorEnabled",header="2FA",           col_type=ColType.TEXT,   width_pct=5,  align="center"),
        ColumnDef(key="lastLoginAt",     header="Last login",    col_type=ColType.DATE,   width_pct=11, align="center"),
        ColumnDef(key="failedLogins",    header="Failed logins", col_type=ColType.INTEGER,width_pct=7,  align="center"),
        ColumnDef(key="locked",          header="Locked",        col_type=ColType.TEXT,   width_pct=6,  align="center"),
        ColumnDef(key="createdAt",       header="Created",       col_type=ColType.DATE,   width_pct=9,  align="center"),
    ],
    summary_fields=[
        {"key": "totalUsers",  "label": "Total users",  "type": ColType.INTEGER},
        {"key": "activeUsers", "label": "Active users",  "type": ColType.INTEGER},
        {"key": "lockedUsers", "label": "Locked users",  "type": ColType.INTEGER},
    ],
))
