"""
Report registry — maps report_type identifiers to ReportDef instances.
"""

from __future__ import annotations

from typing import Dict, Optional

from app.config import ReportDef

_REGISTRY: dict[str, ReportDef] = {}


def register(report_def: ReportDef) -> ReportDef:
    _REGISTRY[report_def.report_id] = report_def
    return report_def


def get_report_def(report_type: str) -> ReportDef | None:
    return _REGISTRY.get(report_type)


def all_report_defs() -> dict[str, ReportDef]:
    return dict(_REGISTRY)


# Import report modules to trigger registration
import app.reports.assets.fixed_asset_register  # noqa: E402, F401
import app.reports.assets.depreciation_schedule  # noqa: E402, F401
import app.reports.assets.asset_aging  # noqa: E402, F401
import app.reports.assets.asset_valuation_summary  # noqa: E402, F401
import app.reports.assets.asset_movement_history  # noqa: E402, F401
import app.reports.assets.asset_condition  # noqa: E402, F401
import app.reports.assets.custom_fields  # noqa: E402, F401
