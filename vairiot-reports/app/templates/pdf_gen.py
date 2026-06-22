"""
PDF report generator — ReportLab with full Vairiot livery.

Key design decisions:
  - A4 portrait or landscape, configurable per report
  - Gradient header band on page 1 only
  - Repeating column headers on every page (via ReportLab Table splitInRow)
  - Tight padding to avoid orphan blank pages
  - Footer on every page: company info left, "Powered by VAIRIOT · Page X of Y" right
  - Banded rows using v-wash (#F8F0FA)
  - Totals row in v-violet with white text
"""

from __future__ import annotations

import io
from datetime import date

from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# Register Montserrat (Vairiot brand font). If the TTFs aren't present
# (e.g. running outside the container), ReportLab silently keeps using
# the built-in PostScript fonts.
_MONTS_DIR = "/usr/share/fonts/truetype/montserrat"
try:
    pdfmetrics.registerFont(TTFont("Montserrat", f"{_MONTS_DIR}/Montserrat-Regular.ttf"))
    pdfmetrics.registerFont(TTFont("Montserrat-Bold", f"{_MONTS_DIR}/Montserrat-Bold.ttf"))
    registerFontFamily(
        "Montserrat",
        normal="Montserrat",
        bold="Montserrat-Bold",
        italic="Montserrat",
        boldItalic="Montserrat-Bold",
    )
except Exception:
    pass

from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, KeepTogether,
)
from reportlab.platypus.flowables import HRFlowable

from app.config import (
    BRAND, ColType, ReportDef,
    MARGIN_TOP_MM, MARGIN_BOTTOM_MM, MARGIN_LEFT_MM, MARGIN_RIGHT_MM,
    HEADER_BAND_MM, FOOTER_HEIGHT_MM,
)
from app.models import ReportRequest
from app.templates.brand import format_value, hex_to_rgb_float, interpolate_gradient


# ── Colour objects ────────────────────────────────────────────────────────────

def _c(hex_val: str) -> colors.Color:
    r, g, b = hex_to_rgb_float(hex_val)
    return colors.Color(r, g, b)


C_PINK     = _c(BRAND.pink)
C_MAUVE    = _c(BRAND.mauve)
C_VIOLET   = _c(BRAND.violet)
C_CHARCOAL = _c(BRAND.charcoal)
C_WHITE    = colors.white
C_WASH     = _c(BRAND.wash)
C_GREY     = _c("#888888")
C_LIGHT_BORDER = _c("#D9D9D9")
C_GREEN    = _c(BRAND.green)
C_RED      = _c(BRAND.red)
C_AMBER    = _c(BRAND.amber)


# ── Paragraph styles ─────────────────────────────────────────────────────────

STYLE_HEADER_BRAND = ParagraphStyle(
    "HeaderBrand", fontName="Montserrat-Bold", fontSize=16,
    textColor=C_WHITE, leading=20,
)
STYLE_HEADER_SUB = ParagraphStyle(
    "HeaderSub", fontName="Montserrat", fontSize=7,
    textColor=colors.Color(1, 1, 1, 0.8), leading=9,
)
STYLE_TITLE = ParagraphStyle(
    "Title", fontName="Montserrat-Bold", fontSize=14,
    textColor=C_VIOLET, leading=18, spaceAfter=2 * mm,
)
STYLE_META = ParagraphStyle(
    "Meta", fontName="Montserrat", fontSize=7,
    textColor=C_GREY, leading=9, spaceAfter=3 * mm,
)
STYLE_SUMMARY_VALUE = ParagraphStyle(
    "SummaryValue", fontName="Montserrat-Bold", fontSize=12,
    textColor=C_VIOLET, leading=15, alignment=TA_CENTER,
)
STYLE_SUMMARY_LABEL = ParagraphStyle(
    "SummaryLabel", fontName="Montserrat", fontSize=6,
    textColor=C_GREY, leading=8, alignment=TA_CENTER,
)
STYLE_COL_HEADER = ParagraphStyle(
    "ColHeader", fontName="Montserrat-Bold", fontSize=7,
    textColor=C_WHITE, leading=9,
)
STYLE_DATA = ParagraphStyle(
    "Data", fontName="Montserrat", fontSize=7,
    textColor=C_CHARCOAL, leading=9,
)
STYLE_DATA_MONO = ParagraphStyle(
    "DataMono", fontName="Montserrat", fontSize=7,
    textColor=C_CHARCOAL, leading=9,
)
STYLE_TOTALS = ParagraphStyle(
    "Totals", fontName="Montserrat-Bold", fontSize=7,
    textColor=C_WHITE, leading=9,
)
STYLE_TOTALS_MONO = ParagraphStyle(
    "TotalsMono", fontName="Montserrat-Bold", fontSize=7,
    textColor=C_WHITE, leading=9,
)
STYLE_FOOTER = ParagraphStyle(
    "Footer", fontName="Montserrat", fontSize=6,
    textColor=C_GREY, leading=7,
)
STYLE_AUTH_TITLE = ParagraphStyle(
    "AuthTitle", fontName="Montserrat-Bold", fontSize=11,
    textColor=C_VIOLET, leading=14, spaceAfter=2 * mm,
)
STYLE_AUTH_LABEL = ParagraphStyle(
    "AuthLabel", fontName="Montserrat", fontSize=7,
    textColor=C_GREY, leading=9,
)


def _col_alignment(col_type: str) -> int:
    if col_type in (ColType.CURRENCY, ColType.NUMBER, ColType.INTEGER, ColType.PERCENT):
        return TA_RIGHT
    if col_type == ColType.DATE:
        return TA_CENTER
    return TA_LEFT


def _data_style(col_type: str) -> ParagraphStyle:
    if col_type in (ColType.CURRENCY, ColType.NUMBER, ColType.INTEGER):
        return ParagraphStyle(
            "d", parent=STYLE_DATA_MONO, alignment=_col_alignment(col_type),
        )
    return ParagraphStyle(
        "d", parent=STYLE_DATA, alignment=_col_alignment(col_type),
    )


def _totals_style(col_type: str) -> ParagraphStyle:
    if col_type in (ColType.CURRENCY, ColType.NUMBER, ColType.INTEGER):
        return ParagraphStyle(
            "t", parent=STYLE_TOTALS_MONO, alignment=_col_alignment(col_type),
        )
    return ParagraphStyle(
        "t", parent=STYLE_TOTALS, alignment=_col_alignment(col_type),
    )


class _VairiotDocTemplate(BaseDocTemplate):
    """Custom doc template that draws the footer on every page."""

    def __init__(self, buf, report_def, req, **kwargs):
        self.report_def = report_def
        self.req = req
        super().__init__(buf, **kwargs)

    def afterPage(self):
        """Draw footer after each page is finished."""
        canvas = self.canv
        page_w = self.report_def.page_width_pt
        page_h = self.report_def.page_height_pt

        # Bottom gradient accent line — smooth gradient
        bar_y = MARGIN_BOTTOM_MM * mm - 4 * mm
        bar_h = 1.5 * mm
        x_start = MARGIN_LEFT_MM * mm
        total_w = page_w - MARGIN_LEFT_MM * mm - MARGIN_RIGHT_MM * mm
        grad_steps = 60
        grad_colours = interpolate_gradient(BRAND.gradient_stops(), grad_steps)
        slice_w = total_w / grad_steps

        canvas.saveState()
        for i, hex_c in enumerate(grad_colours):
            canvas.setFillColor(_c(hex_c))
            canvas.rect(x_start + i * slice_w, bar_y, slice_w + 0.5, bar_h, stroke=0, fill=1)

        # Footer text
        footer_y = bar_y - 3 * mm
        canvas.setFont("Montserrat", 5.5)
        canvas.setFillColor(C_GREY)

        company_line = "Confidential"
        if self.req.company.legal_name:
            company_line += f" · {self.req.company.legal_name}"
        company_line += " · Generated by the Vairiot platform."
        canvas.drawString(MARGIN_LEFT_MM * mm, footer_y, company_line)

        page_text = f"Page {canvas.getPageNumber()}"
        canvas.drawRightString(page_w - MARGIN_RIGHT_MM * mm, footer_y, page_text)

        canvas.restoreState()


def generate_pdf(report_def: ReportDef, req: ReportRequest) -> io.BytesIO:
    buf = io.BytesIO()

    pagesize = landscape(A4) if report_def.is_landscape else A4
    page_w = report_def.page_width_pt
    page_h = report_def.page_height_pt

    # Usable frame (excluding margins + header space on page 1, footer)
    frame_x = MARGIN_LEFT_MM * mm
    frame_w = report_def.printable_width_pt
    frame_y = MARGIN_BOTTOM_MM * mm + FOOTER_HEIGHT_MM * mm
    frame_h = page_h - MARGIN_TOP_MM * mm - MARGIN_BOTTOM_MM * mm - FOOTER_HEIGHT_MM * mm

    frame = Frame(
        frame_x, frame_y, frame_w, frame_h,
        leftPadding=0, rightPadding=0,
        topPadding=0, bottomPadding=0,
        id="main",
    )

    doc = _VairiotDocTemplate(
        buf, report_def, req,
        pagesize=pagesize,
        leftMargin=MARGIN_LEFT_MM * mm,
        rightMargin=MARGIN_RIGHT_MM * mm,
        topMargin=MARGIN_TOP_MM * mm,
        bottomMargin=(MARGIN_BOTTOM_MM + FOOTER_HEIGHT_MM) * mm,
    )

    doc.addPageTemplates([
        PageTemplate(id="main", frames=[frame], onPage=_draw_page_header),
    ])

    story: list = []

    # ── Header content (page 1 only, added to story) ─────────────────────

    # Gradient accent strip (thin bar above header)
    grad_steps = 30
    grad_colours = interpolate_gradient(BRAND.gradient_stops(), grad_steps)
    grad_slice_w = frame_w / grad_steps
    grad_data = [[""] * grad_steps]
    grad_table = Table(grad_data, colWidths=[grad_slice_w] * grad_steps, rowHeights=[2 * mm])
    grad_style_cmds = []
    for i, hex_c in enumerate(grad_colours):
        grad_style_cmds.append(("BACKGROUND", (i, 0), (i, 0), _c(hex_c)))
    grad_style_cmds.extend([
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ])
    grad_table.setStyle(TableStyle(grad_style_cmds))
    story.append(grad_table)

    # Brand name: "VAIR" charcoal + "IOT" per-letter gradient (matching DOCX)
    brand_text = '<font color="#2B3132">VAIR</font><font color="#FF0DCC">I</font><font color="#A05B97">O</font><font color="#615AA0">T</font>'
    header_data = [[
        Paragraph(brand_text, STYLE_HEADER_BRAND),
        "",
    ]]
    header_table = Table(header_data, colWidths=[frame_w * 0.5, frame_w * 0.5])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)

    # Subtitle + company info row
    company_text = ""
    if req.company.legal_name:
        company_text = f"<b>{req.company.legal_name}</b>"
        addr_parts = [req.company.address_line1, req.company.city, req.company.country]
        addr = ", ".join(p for p in addr_parts if p)
        if addr:
            company_text += f"<br/>{addr}"

    sub_data = [[
        Paragraph("ASSET INTELLIGENCE", ParagraphStyle(
            "sub", fontName="Montserrat", fontSize=7, textColor=_c("#888888"),
        )),
        Paragraph(company_text, ParagraphStyle(
            "co", fontName="Montserrat", fontSize=8, textColor=_c("#2B3132"), alignment=TA_RIGHT,
        )) if company_text else "",
    ]]
    sub_table = Table(sub_data, colWidths=[frame_w * 0.4, frame_w * 0.6])
    sub_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(sub_table)

    # Report title bar (violet background)
    title_data = [[
        Paragraph(report_def.title, ParagraphStyle(
            "rt", fontName="Montserrat-Bold", fontSize=11, textColor=colors.white,
        )),
        Paragraph(f"Generated: {date.today().strftime('%d %b %Y')}", ParagraphStyle(
            "rd", fontName="Montserrat", fontSize=8, textColor=colors.white, alignment=TA_RIGHT,
        )),
    ]]
    title_table = Table(title_data, colWidths=[frame_w * 0.6, frame_w * 0.4])
    title_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_VIOLET),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
        ("LEFTPADDING", (0, 0), (0, -1), 3 * mm),
        ("RIGHTPADDING", (1, 0), (1, -1), 3 * mm),
    ]))
    story.append(title_table)

    # Metadata line
    meta_parts = []
    if req.tenant_name:
        meta_parts.append(f"Tenant: {req.tenant_name}")
    for k, v in req.filters.items():
        label = k.replace("_", " ").replace("Id", "").title()
        meta_parts.append(f"{label}: {v}")
    meta_parts.append(f"Total rows: {len(req.rows)}")

    story.append(Spacer(1, 3 * mm))

    # Metadata on wash background
    meta_data = [[Paragraph(" · ".join(meta_parts), ParagraphStyle(
        "meta", parent=STYLE_META, fontSize=7, textColor=C_CHARCOAL,
    ))]]
    meta_table = Table(meta_data, colWidths=[frame_w])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_WASH),
        ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
    ]))
    story.append(meta_table)

    # ── Summary metrics ───────────────────────────────────────────────────
    if report_def.summary_fields and req.summary:
        story.append(Spacer(1, 3 * mm))
        num_metrics = len(report_def.summary_fields)
        metric_w = frame_w / num_metrics

        accent_colours = [C_GREEN, C_RED, C_AMBER, C_VIOLET, _c(BRAND.blue), C_PINK, C_MAUVE]

        metric_data = []
        for sf in report_def.summary_fields:
            val = req.summary.get(sf["key"], "")
            formatted = format_value(val, sf.get("type", ColType.TEXT), req.currency)
            cell_content = [
                Paragraph(formatted, ParagraphStyle(
                    "sv", parent=STYLE_SUMMARY_VALUE, alignment=TA_CENTER,
                )),
                Paragraph(sf["label"], STYLE_SUMMARY_LABEL),
            ]
            metric_data.append(cell_content)

        # Build as single-row table, each cell is a list of flowables
        metric_row = [[item for sublist in [cell] for item in (sublist if isinstance(sublist, list) else [sublist])] for cell in metric_data]
        # Flatten: each column gets stacked paragraphs
        flat_row = []
        for cell in metric_data:
            if isinstance(cell, list):
                flat_row.append(cell)
            else:
                flat_row.append([cell])

        metric_table_data = [flat_row]
        metric_table = Table(metric_table_data, colWidths=[metric_w] * num_metrics)

        style_cmds = [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
            ("BACKGROUND", (0, 0), (-1, -1), C_WASH),
        ]
        for i in range(num_metrics):
            colour = accent_colours[i % len(accent_colours)]
            style_cmds.append(("LINEBEFOREDECOR", (i, 0), (i, -1), 2, colour))

        metric_table.setStyle(TableStyle(style_cmds))
        story.append(metric_table)

    story.append(Spacer(1, 4 * mm))

    # ── Data table ────────────────────────────────────────────────────────
    col_widths = report_def.resolve_column_widths_pt()
    num_cols = len(report_def.columns)

    # Header row
    header_cells = []
    for col_def in report_def.columns:
        style = ParagraphStyle(
            "ch", parent=STYLE_COL_HEADER,
            alignment=_col_alignment(col_def.col_type),
        )
        header_cells.append(Paragraph(col_def.header, style))

    table_data = [header_cells]

    # Data rows
    for row_data in req.rows:
        row_cells = []
        for col_def in report_def.columns:
            raw_val = row_data.get(col_def.key)
            formatted = format_value(raw_val, col_def.col_type, req.currency)
            style = _data_style(col_def.col_type)
            row_cells.append(Paragraph(formatted, style))
        table_data.append(row_cells)

    # Totals row
    if report_def.show_totals and req.totals:
        totals_cells = []
        for i, col_def in enumerate(report_def.columns):
            if i == 0:
                label = report_def.totals_label
                if "count" in req.totals:
                    label = f"{label} ({format_value(req.totals['count'], ColType.INTEGER, req.currency)} assets)"
                totals_cells.append(Paragraph(label, STYLE_TOTALS))
            elif col_def.key in req.totals:
                style = _totals_style(col_def.col_type)
                totals_cells.append(Paragraph(
                    format_value(req.totals[col_def.key], col_def.col_type, req.currency), style,
                ))
            else:
                totals_cells.append(Paragraph("", STYLE_TOTALS))
        table_data.append(totals_cells)

    data_table = Table(
        table_data,
        colWidths=col_widths,
        repeatRows=1,
        splitInRow=0,
    )

    # Table styling
    num_data_rows = len(req.rows)
    total_table_rows = len(table_data)

    style_cmds = [
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), C_VIOLET),
        ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 2.5 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2.5 * mm),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
        # Data row padding
        ("TOPPADDING", (0, 1), (-1, -1), 1.5 * mm),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 1.5 * mm),
        # Horizontal grid lines (thin, grey)
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, C_LIGHT_BORDER),
    ]

    # Banded rows
    for i in range(1, num_data_rows + 1):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), C_WASH))

    # Totals row
    if report_def.show_totals and req.totals:
        last_row = total_table_rows - 1
        style_cmds.extend([
            ("BACKGROUND", (0, last_row), (-1, last_row), C_VIOLET),
            ("TEXTCOLOR", (0, last_row), (-1, last_row), C_WHITE),
            ("TOPPADDING", (0, last_row), (-1, last_row), 2.5 * mm),
            ("BOTTOMPADDING", (0, last_row), (-1, last_row), 2.5 * mm),
        ])

    data_table.setStyle(TableStyle(style_cmds))
    story.append(data_table)

    # ── Build PDF ─────────────────────────────────────────────────────────
    doc.build(story)
    buf.seek(0)
    return buf


def _draw_page_header(canvas, doc):
    """Called on every page — used for repeating elements if needed.

    The main header is part of the story (page 1 only).
    The footer is drawn by _VairiotDocTemplate.afterPage().
    This hook is available for future per-page decorations.
    """
    pass
