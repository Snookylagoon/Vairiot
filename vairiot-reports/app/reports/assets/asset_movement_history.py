"""
Asset movement history — landscape A4.

All transfers, checkouts, and location changes per asset or site.
Wide column set: from/to site, location, custodian, dates.
"""

from app.config import ColumnDef, ColType, ReportDef
from app.reports import register

report = register(ReportDef(
    report_id="asset-movement-history",
    title="Asset movement history",
    subtitle="Complete transfer and checkout log with location changes",
    orientation="landscape",
    show_totals=False,
    columns=[
        ColumnDef(key="assetNumber",   header="Asset #",        col_type=ColType.TEXT,   width_pct=8,   align="left"),
        ColumnDef(key="assetName",     header="Asset name",     col_type=ColType.TEXT,   width_pct=13,  align="left"),
        ColumnDef(key="movementType",  header="Type",           col_type=ColType.TEXT,   width_pct=6,   align="center"),
        ColumnDef(key="movementDate",  header="Date",           col_type=ColType.DATE,   width_pct=7,   align="center"),
        ColumnDef(key="fromSite",      header="From site",      col_type=ColType.TEXT,   width_pct=10,  align="left"),
        ColumnDef(key="fromLocation",  header="From location",  col_type=ColType.TEXT,   width_pct=9,   align="left"),
        ColumnDef(key="toSite",        header="To site",        col_type=ColType.TEXT,   width_pct=10,  align="left"),
        ColumnDef(key="toLocation",    header="To location",    col_type=ColType.TEXT,   width_pct=9,   align="left"),
        ColumnDef(key="custodian",     header="Custodian",       col_type=ColType.TEXT,   width_pct=10,  align="left"),
        ColumnDef(key="reason",        header="Reason",          col_type=ColType.TEXT,   width_pct=10,  align="left"),
        ColumnDef(key="approvedBy",    header="Approved by",     col_type=ColType.TEXT,   width_pct=8,   align="left"),
    ],
    summary_fields=[
        {"key": "totalTransfers",  "label": "Total transfers",  "type": ColType.INTEGER},
        {"key": "totalCheckouts",  "label": "Total checkouts",  "type": ColType.INTEGER},
        {"key": "totalMovements",  "label": "Total movements",  "type": ColType.INTEGER},
    ],
))
