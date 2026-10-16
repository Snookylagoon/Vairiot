"""
Build the Phase 1 Word report for Vairiot Asset Intelligence.

Usage (from the project root):
    python3 docs/word/build_phase1.py

Phase 1 is Sprint S1 (decision D1). The report assembles the Phase 1 record
(docs/04-phase-1-record.md), the S1 summary (docs/sprints/S1-summary.md,
without its file list) and the GIS data model (docs/GIS-DATA-MODEL.md, TOR
Deliverable D4), and writes
docs/word/Vairiot-AI-Phase-1-GIS-Condition-Photos.docx.

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
OUTPUT = HERE / "Vairiot-AI-Phase-1-GIS-Condition-Photos.docx"
REVISION = "0.1"
REVISION_DATE = "16 October 2026"

# (heading shown in the summary table, source file) — order of the report
SECTIONS = [
    ("Phase 1 record — exit gate, decisions, open points",
     DOCS / "04-phase-1-record.md"),
    ("Sprint S1 summary — what changed and how to verify it",
     DOCS / "sprints" / "S1-summary.md"),
    ("GIS data model — TOR Deliverable D4",
     DOCS / "GIS-DATA-MODEL.md"),
]


def _source(path: Path) -> str:
    """The Markdown for one part; the S1 file list stays in the repository."""
    text = path.read_text(encoding="utf-8")
    if path.name == "S1-summary.md" and "\n## Files" in text:
        text = text[:text.index("\n## Files")] + (
            "\n## Files\n\nThe full list of files added or changed in this "
            "phase is in `docs/sprints/S1-summary.md` in the repository.\n")
    return text


def _summary(doc) -> None:
    doc.add_paragraph("About this document", style="Heading 1")
    p = doc.add_paragraph()
    md_to_docx.add_inline(
        p, "This report records **Phase 1 — GIS, Condition and Photos** of "
           "Vairiot Asset Intelligence, the RFID and IoT fixed-asset "
           "management platform. Under decision D1, Phase N is Sprint SN, so "
           "Phase 1 is Sprint S1 of the TUDA programme (stages 1.0–1.21). "
           "Its GIS data model is TOR Deliverable D4.")
    p = doc.add_paragraph()
    md_to_docx.add_inline(
        p, "Each part below is generated from the Markdown file of the same "
           "name in the project repository, so the Word edition and the "
           "repository always agree.")
    vt.callout(doc, "Status",
               "Phase 1 is built (version 2.6.1). The exit gate passed on the "
               "Docker stack on 16 October 2026: 15 of 15 automated checks "
               "and both browser suites. Two field checks with a device "
               "outdoors are outstanding. Phase 1 awaits owner acceptance.")
    rows = [["Part", "Source file"]] + [
        [title, f"`{path.relative_to(ROOT)}`"] for title, path in SECTIONS]
    md_to_docx.add_table(doc, rows)


def build() -> Path:
    missing = [str(path) for _title, path in SECTIONS if not path.exists()]
    if missing:
        raise SystemExit("Missing source files: " + ", ".join(missing))
    doc = vt.new_document("Phase 1 — GIS, Condition and Photos")
    vt.cover_page(
        doc,
        "Phase 1 — GIS, Condition and Photos",
        "Phase 1 record, Sprint S1 summary and the GIS data model "
        "(Deliverable D4)",
        [("Product", "Vairiot Asset Intelligence"),
         ("Programme", "TUDA — Tbilisi Transport and Urban Development "
                       "Agency, sprints S0–S5"),
         ("Owner", "Don Scott, VAIRIOT FZCO"),
         ("Phase status", "Exit gate passed 16 October 2026; awaiting "
                          "acceptance"),
         ("Revision", f"{REVISION} ({REVISION_DATE})"),
         ("Version", "2.6.1")],
    )
    vt.contents_page(doc)
    _summary(doc)
    for _title, path in SECTIONS:
        doc.add_paragraph().add_run().add_break(md_to_docx.WD_BREAK.PAGE)
        md_to_docx.convert(doc, _source(path), IMAGES, h1_page_break=False)
    doc.core_properties.title = ("Vairiot Asset Intelligence — Phase 1 "
                                 "GIS, Condition and Photos")
    doc.core_properties.author = "VAIRIOT FZCO"
    doc.core_properties.subject = "Vairiot Asset Intelligence"
    doc.core_properties.revision = 1
    doc.core_properties.version = REVISION
    doc.core_properties.language = "en-GB"
    doc.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    print(f"Written: {build()}")
