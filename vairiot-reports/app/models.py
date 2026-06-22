"""
Pydantic models for the report generation API.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Any, Optional


class CompanyInfo(BaseModel):
    legal_name: str = ""
    trading_name: str = ""
    registration_number: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    state_province: str = ""
    postal_code: str = ""
    country: str = ""
    primary_contact_name: str = ""
    primary_contact_email: str = ""
    primary_contact_phone: str = ""
    logo_url: Optional[str] = None

    @property
    def full_address(self) -> str:
        parts = [
            self.address_line1,
            self.address_line2,
            self.city,
            self.state_province,
            self.postal_code,
            self.country,
        ]
        return ", ".join(p for p in parts if p)


class ReportRequest(BaseModel):
    report_type: str
    format: str = Field(pattern=r"^(csv|xlsx|docx|pdf)$")
    rows: list[dict[str, Any]]
    totals: dict[str, Any] = Field(default_factory=dict)
    summary: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)
    company: CompanyInfo = Field(default_factory=CompanyInfo)
    extra_columns: list[dict[str, Any]] = Field(default_factory=list)
    generated_by: str = ""
    tenant_name: str = ""
    currency: str = "USD"
