"""
Build the Phase 2 Word report for Vairiot Asset Intelligence.

Usage (from the project root):
    python3 docs/word/build_phase2.py

Phase 2 is Sprint S2 (decision D1). The report assembles the Phase 2 record
(docs/06-phase-2-record.md), the S2 summary (docs/sprints/S2-summary.md,
without its file list) and the IPSAS ledger mechanics
(docs/IPSAS-LEDGER-MECHANICS.md, behind TOR Deliverable D2), and writes
docs/word/Vairiot-AI-Phase-2-IPSAS-Ledger-and-Import.docx.

Python and python-docx only: never JavaScript libraries or Word automation.
"""

from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import md_to_docx  # noqa: E402
import vairiot_theme as vt  # noqa: E402

ROOT = HERE.parent.parent
DOCS = ROOT / "docs"
IMAGES = HERE / "images"
OUTPUT = HERE / "Vairiot-AI-Phase-2-IPSAS-Ledger-and-Import.docx"
REVISION = "0.1"
REVISION_DATE = "17 October 2026"

# (heading shown in the summary table, source file) — order of the report
SECTIONS = [
    ("Phase 2 record — exit gate, decisions, open points",
     DOCS / "06-phase-2-record.md"),
    ("Sprint S2 summary — what changed and how to verify it",
     DOCS / "sprints" / "S2-summary.md"),
    ("IPSAS ledger mechanics — behind TOR Deliverable D2",
     DOCS / "IPSAS-LEDGER-MECHANICS.md"),
]


def _source(path: Path) -> str:
    """The Markdown for one part; the S2 file list stays in the repository."""
    text = path.read_text(encoding="utf-8")
    if path.name == "S2-summary.md" and "\n## Files" in text:
        text = text[:text.index("\n## Files")] + (
            "\n## Files\n\nThe full list of files added or changed in this "
            "phase is in `docs/sprints/S2-summary.md` in the repository.\n")
    return text


def _summary(doc) -> None:
    doc.add_paragraph("About this document", style="Heading 1")
    p = doc.add_paragraph()
    md_to_docx.add_inline(
        p, "This report records **Phase 2 — IPSAS Ledger and Register "
           "Import** of Vairiot Asset Intelligence, the RFID and IoT "
           "fixed-asset management platform. Under decision D1, Phase N is "
           "Sprint SN, so Phase 2 is Sprint S2 of the TUDA programme (stages "
           "2.0–2.17). Its ledger mechanics are what the Accounting Policy "
           "Manual, TOR Deliverable D2, sets the figures for.")
    p = doc.add_paragraph()
    md_to_docx.add_inline(
        p, "Each part below is generated from the Markdown file of the same "
           "name in the project repository, so the Word edition and the "
           "repository always agree.")
    vt.callout(doc, "Status",
               "Phase 2 is built (version 2.13.1). The exit gate passed on the "
               "Docker stack on 17 October 2026: 14 of 14 Phase 2 checks, 8 "
               "of 8 import checks (10,000 rows in 45 seconds), the 15 Phase 1 "
               "checks and both browser suites. Phase 2 awaits owner "
               "acceptance.")
    rows = [["Part", "Source file"]] + [
        [title, f"`{path.relative_to(ROOT)}`"] for title, path in SECTIONS]
    md_to_docx.add_table(doc, rows)


def build() -> Path:
    missing = [str(path) for _title, path in SECTIONS if not path.exists()]
    if missing:
        raise SystemExit("Missing source files: " + ", ".join(missing))
    doc = vt.new_document("Phase 2 — IPSAS Ledger and Register Import")
    vt.cover_page(
        doc,
        "Phase 2 — IPSAS Ledger and Register Import",
        "Phase 2 record, Sprint S2 summary and the IPSAS ledger mechanics "
        "(behind Deliverable D2)",
        [("Product", "Vairiot Asset Intelligence"),
         ("Programme", "TUDA — Tbilisi Transport and Urban Development "
                       "Agency, sprints S0–S5"),
         ("Owner", "Don Scott, VAIRIOT FZCO"),
         ("Phase status", "Exit gate passed 17 October 2026; awaiting "
                          "acceptance"),
         ("Revision", f"{REVISION} ({REVISION_DATE})"),
         ("Version", "2.13.1")],
    )
    vt.contents_page(doc)
    _summary(doc)
    for _title, path in SECTIONS:
        doc.add_paragraph().add_run().add_break(md_to_docx.WD_BREAK.PAGE)
        md_to_docx.convert(doc, _source(path), IMAGES, h1_page_break=False)
    doc.core_properties.title = ("Vairiot Asset Intelligence — Phase 2 "
                                 "IPSAS Ledger and Register Import")
    doc.core_properties.author = "VAIRIOT FZCO"
    doc.core_properties.subject = "Vairiot Asset Intelligence"
    doc.core_properties.revision = 1
    doc.core_properties.version = REVISION
    doc.core_properties.language = "en-GB"
    doc.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    print(f"Written: {build()}")
