"""
Vairiot Report Service — brand constants and page geometry.

All measurements in millimetres unless noted. ReportLab uses points
(1 pt = 1/72 inch ≈ 0.3528 mm), so helpers convert where needed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


# ── Brand colours ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class BrandColours:
    pink:     str = "#FF0DCC"
    mauve:    str = "#A05B97"
    violet:   str = "#615AA0"
    charcoal: str = "#2B3132"
    wash:     str = "#F8F0FA"
    white:    str = "#FFFFFF"

    # Semantic status
    green:  str = "#1D9E75"
    red:    str = "#E24B4A"
    amber:  str = "#BA7517"
    blue:   str = "#185FA5"

    def gradient_stops(self) -> list[str]:
        return [self.pink, self.mauve, self.violet]


BRAND = BrandColours()


# ── Typography ────────────────────────────────────────────────────────────────

FONT_FAMILY_SANS  = "Montserrat"
FONT_FAMILY_MONO  = "IBM Plex Mono"

# Fallbacks for environments without custom fonts installed
FONT_FALLBACK_SANS = "Helvetica"
FONT_FALLBACK_MONO = "Courier"


# ── Page geometry (A4, millimetres) ───────────────────────────────────────────

A4_WIDTH_MM  = 210.0
A4_HEIGHT_MM = 297.0

# Margins
MARGIN_TOP_MM    = 20.0
MARGIN_BOTTOM_MM = 18.0
MARGIN_LEFT_MM   = 16.0
MARGIN_RIGHT_MM  = 16.0

# Header band height
HEADER_BAND_MM = 22.0

# Footer height
FOOTER_HEIGHT_MM = 12.0


def mm_to_pt(mm: float) -> float:
    return mm * 72.0 / 25.4


def pt_to_mm(pt: float) -> float:
    return pt * 25.4 / 72.0


# Pre-computed point values
A4_WIDTH_PT       = mm_to_pt(A4_WIDTH_MM)
A4_HEIGHT_PT      = mm_to_pt(A4_HEIGHT_MM)
MARGIN_TOP_PT     = mm_to_pt(MARGIN_TOP_MM)
MARGIN_BOTTOM_PT  = mm_to_pt(MARGIN_BOTTOM_MM)
MARGIN_LEFT_PT    = mm_to_pt(MARGIN_LEFT_MM)
MARGIN_RIGHT_PT   = mm_to_pt(MARGIN_RIGHT_MM)
HEADER_BAND_PT    = mm_to_pt(HEADER_BAND_MM)
FOOTER_HEIGHT_PT  = mm_to_pt(FOOTER_HEIGHT_MM)


# ── Column type hints for formatting ─────────────────────────────────────────

class ColType:
    TEXT      = "text"
    NUMBER    = "number"
    CURRENCY  = "currency"
    DATE      = "date"
    PERCENT   = "percent"
    STATUS    = "status"
    INTEGER   = "integer"


# ── Report definition dataclass ──────────────────────────────────────────────

@dataclass
class ColumnDef:
    key: str
    header: str
    col_type: str = ColType.TEXT
    width_pct: float = 0.0      # percentage of printable width (0 = auto)
    align: str = "left"         # left | center | right


@dataclass
class ReportDef:
    report_id: str
    title: str
    subtitle: str = ""
    orientation: str = "portrait"   # portrait | landscape
    columns: list[ColumnDef] = field(default_factory=list)
    show_totals: bool = False
    totals_label: str = "Total"
    summary_fields: list[dict] = field(default_factory=list)

    @property
    def is_landscape(self) -> bool:
        return self.orientation == "landscape"

    @property
    def page_width_mm(self) -> float:
        return A4_HEIGHT_MM if self.is_landscape else A4_WIDTH_MM

    @property
    def page_height_mm(self) -> float:
        return A4_WIDTH_MM if self.is_landscape else A4_HEIGHT_MM

    @property
    def page_width_pt(self) -> float:
        return mm_to_pt(self.page_width_mm)

    @property
    def page_height_pt(self) -> float:
        return mm_to_pt(self.page_height_mm)

    @property
    def printable_width_mm(self) -> float:
        return self.page_width_mm - MARGIN_LEFT_MM - MARGIN_RIGHT_MM

    @property
    def printable_width_pt(self) -> float:
        return mm_to_pt(self.printable_width_mm)

    def resolve_column_widths_pt(self) -> list[float]:
        """Return absolute column widths in points.

        Columns with width_pct > 0 get that proportion of printable width.
        Remaining columns split the leftover equally.
        """
        pw = self.printable_width_pt
        fixed_total = sum(c.width_pct for c in self.columns if c.width_pct > 0)
        auto_cols = [c for c in self.columns if c.width_pct <= 0]
        remaining = max(0, pw - (fixed_total / 100.0 * pw))
        auto_w = remaining / len(auto_cols) if auto_cols else 0

        widths: list[float] = []
        for c in self.columns:
            if c.width_pct > 0:
                widths.append(c.width_pct / 100.0 * pw)
            else:
                widths.append(auto_w)
        return widths
