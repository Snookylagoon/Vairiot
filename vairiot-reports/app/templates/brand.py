"""
Shared brand utilities — hex conversion, date formatting, value formatting.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Tuple


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def hex_to_rgb_float(h: str) -> tuple[float, float, float]:
    r, g, b = hex_to_rgb(h)
    return r / 255.0, g / 255.0, b / 255.0


def format_date(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, (date, datetime)):
        return val.strftime("%d %b %Y")
    if isinstance(val, str) and len(val) >= 10:
        try:
            return datetime.fromisoformat(val[:10]).strftime("%d %b %Y")
        except ValueError:
            return val
    return str(val)


def format_currency(val: Any) -> str:
    if val is None:
        return ""
    try:
        v = float(val)
        if v < 0:
            return f"-${abs(v):,.2f}"
        return f"${v:,.2f}"
    except (ValueError, TypeError):
        return str(val)


def format_number(val: Any) -> str:
    if val is None:
        return ""
    try:
        v = float(val)
        if v == int(v):
            return f"{int(v):,}"
        return f"{v:,.2f}"
    except (ValueError, TypeError):
        return str(val)


def format_integer(val: Any) -> str:
    if val is None:
        return ""
    try:
        return f"{int(float(val)):,}"
    except (ValueError, TypeError):
        return str(val)


def format_percent(val: Any) -> str:
    if val is None:
        return ""
    try:
        return f"{float(val):.1f}%"
    except (ValueError, TypeError):
        return str(val)


def format_value(val: Any, col_type: str) -> str:
    from app.config import ColType
    if col_type == ColType.CURRENCY:
        return format_currency(val)
    if col_type == ColType.DATE:
        return format_date(val)
    if col_type == ColType.NUMBER:
        return format_number(val)
    if col_type == ColType.INTEGER:
        return format_integer(val)
    if col_type == ColType.PERCENT:
        return format_percent(val)
    if val is None:
        return ""
    return str(val)


def safe_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val)


def interpolate_gradient(stops: list[str], n: int) -> list[str]:
    """Generate n evenly-spaced hex colours across a list of colour stops."""
    if n <= 1:
        return [stops[0]]
    rgbs = [hex_to_rgb(s) for s in stops]
    result = []
    for i in range(n):
        t = i / (n - 1)
        seg_t = t * (len(rgbs) - 1)
        idx = min(int(seg_t), len(rgbs) - 2)
        local_t = seg_t - idx
        r = int(rgbs[idx][0] + (rgbs[idx + 1][0] - rgbs[idx][0]) * local_t)
        g = int(rgbs[idx][1] + (rgbs[idx + 1][1] - rgbs[idx][1]) * local_t)
        b = int(rgbs[idx][2] + (rgbs[idx + 1][2] - rgbs[idx][2]) * local_t)
        result.append(f"#{r:02X}{g:02X}{b:02X}")
    return result
