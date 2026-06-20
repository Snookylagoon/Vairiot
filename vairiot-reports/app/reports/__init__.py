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

# Disposals
import app.reports.disposals.disposal_register  # noqa: E402, F401
import app.reports.disposals.disposal_gain_loss  # noqa: E402, F401
import app.reports.disposals.disposal_by_method  # noqa: E402, F401

# Audits
import app.reports.audits.campaign_summary  # noqa: E402, F401
import app.reports.audits.reconciliation_detail  # noqa: E402, F401
import app.reports.audits.scan_log  # noqa: E402, F401

# Maintenance
import app.reports.maintenance.maintenance_log  # noqa: E402, F401
import app.reports.maintenance.maintenance_cost  # noqa: E402, F401
import app.reports.maintenance.maintenance_schedule  # noqa: E402, F401

# Checkouts
import app.reports.checkouts.checkout_log  # noqa: E402, F401
import app.reports.checkouts.current_checkouts  # noqa: E402, F401
import app.reports.checkouts.checkout_history  # noqa: E402, F401

# Licences
import app.reports.licences.licence_register  # noqa: E402, F401
import app.reports.licences.licence_expiry  # noqa: E402, F401
import app.reports.licences.device_allocation  # noqa: E402, F401

# Tenants
import app.reports.tenants.tenant_register  # noqa: E402, F401
import app.reports.tenants.tenant_activity  # noqa: E402, F401

# Users
import app.reports.users.user_register  # noqa: E402, F401
import app.reports.users.user_access  # noqa: E402, F401
import app.reports.users.user_activity_log  # noqa: E402, F401

# Exceptions
import app.reports.exceptions.exception_summary  # noqa: E402, F401
import app.reports.exceptions.alert_subscriptions  # noqa: E402, F401

# Company
import app.reports.company.company_profile  # noqa: E402, F401
import app.reports.company.compliance_overview  # noqa: E402, F401
