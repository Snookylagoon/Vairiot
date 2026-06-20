"""
Custom fields report — landscape A4.

Variable column count: base asset columns + all tenant-defined custom fields.
The column definitions here are the base set; the Node.js API will append
custom field columns dynamically before sending the request.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="custom-fields",
    title="Custom fields report",
    subtitle="Asset listing with all tenant-defined custom field values",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",  header="Asset #",    col_type=ColType.TEXT,   width_pct=10,  align="left"),
        ColumnDef(key="name",         header="Name",        col_type=ColType.TEXT,   width_pct=18,  align="left"),
        ColumnDef(key="category",     header="Category",    col_type=ColType.TEXT,   width_pct=12,  align="left"),
        ColumnDef(key="site",         header="Site",        col_type=ColType.TEXT,   width_pct=12,  align="left"),
        ColumnDef(key="status",       header="Status",      col_type=ColType.STATUS, width_pct=8,   align="center"),
        # Custom field columns are appended dynamically by the API
        # based on CustomFieldDefinition records for the tenant.
        # Width percentages for custom columns will be distributed
        # equally across the remaining 40% of printable width.
    ],
))
