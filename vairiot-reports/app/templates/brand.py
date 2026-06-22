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


# ISO 4217 → display symbol. Codes not listed fall back to the code itself
# (e.g. "AED 1,234.00"), which is also valid Intl narrowSymbol behaviour.
_CURRENCY_SYMBOLS: dict[str, str] = {
    "USD": "$",  "GBP": "£",  "EUR": "€",  "JPY": "¥",  "CNY": "¥",
    "CAD": "C$", "AUD": "A$", "NZD": "NZ$", "CHF": "CHF", "INR": "₹",
    "SGD": "S$", "HKD": "HK$", "KRW": "₩",  "SEK": "kr", "NOK": "kr",
    "DKK": "kr", "PLN": "zł", "ZAR": "R",  "BRL": "R$", "MXN": "MX$",
    "TRY": "₺",  "THB": "฿",  "MYR": "RM", "IDR": "Rp", "PHP": "₱",
    "TWD": "NT$","ILS": "₪",  "CZK": "Kč", "HUF": "Ft", "RUB": "₽",
    "NGN": "₦",  "KES": "KSh","EGP": "E£",
}

# Codes that conventionally print after the amount with a space, e.g. "1,234.00 AED"
_POSTFIX_CODES = {"AED", "SAR", "QAR", "KWD", "BHD", "OMR"}


def _currency_symbol(code: str) -> str:
    code = (code or "USD").upper()
    return _CURRENCY_SYMBOLS.get(code, f"{code} ")


def format_currency(val: Any, code: str = "USD") -> str:
    if val is None:
        return ""
    try:
        v = float(val)
        amount = f"{abs(v):,.2f}"
        sign = "-" if v < 0 else ""
        c = (code or "USD").upper()
        if c in _POSTFIX_CODES:
            return f"{sign}{amount} {c}"
        sym = _currency_symbol(c)
        return f"{sign}{sym}{amount}"
    except (ValueError, TypeError):
        return str(val)


def currency_excel_format(code: str) -> str:
    """Return an Excel number-format string for the given currency code."""
    c = (code or "USD").upper()
    if c in _POSTFIX_CODES:
        return f'#,##0.00" {c}";-#,##0.00" {c}"'
    sym = _CURRENCY_SYMBOLS.get(c)
    if sym is None:
        return f'"{c} "#,##0.00;-"{c} "#,##0.00'
    # Escape symbol for Excel format string
    return f'"{sym}"#,##0.00;-"{sym}"#,##0.00'


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


def format_value(val: Any, col_type: str, currency: str = "USD") -> str:
    from app.config import ColType
    if col_type == ColType.CURRENCY:
        return format_currency(val, currency)
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
