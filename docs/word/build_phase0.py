"""
Build the Phase 0 Word report for Vairiot Asset Intelligence.

Usage (from the project root):
    python3 docs/word/build_phase0.py

Phase 0 is Sprint S0 (decision D1). The report assembles the S0 record
(docs/sprints/S0-summary.md) and the Managed Development Standard adoption
audit and plan (docs/standard-adoption-plan.md, stage 0.8), and writes
docs/word/Vairiot-AI-Phase-0-Hardening-and-Hosting.docx.

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
OUTPUT = HERE / "Vairiot-AI-Phase-0-Hardening-and-Hosting.docx"
REVISION = "0.1"
REVISION_DATE = "16 October 2026"

# (heading shown in the summary table, source file) — order of the report
SECTIONS = [
    ("Sprint S0 record — hardening and hosting",
     DOCS / "sprints" / "S0-summary.md"),
    ("Managed Development Standard — adoption audit and plan",
     DOCS / "standard-adoption-plan.md"),
]


def _summary(doc) -> None:
    doc.add_paragraph("About this document", style="Heading 1")
    p = doc.add_paragraph()
    md_to_docx.add_inline(
        p, "This report records **Phase 0 — Hardening and Hosting** of "
           "Vairiot Asset Intelligence, the RFID and IoT fixed-asset "
           "management platform. Under decision D1, Phase N is Sprint SN, so "
           "Phase 0 is Sprint S0 of the TUDA programme (stages 0.1–0.7), "
           "followed by the adoption audit of the Managed Development "
           "Standard (stage 0.8).")
    p = doc.add_paragraph()
    md_to_docx.add_inline(
        p, "Each part below is generated from the Markdown file of the same "
           "name in the project repository, so the Word edition and the "
           "repository always agree.")
    vt.callout(doc, "Status",
               "Sprint S0 closed on 6 October 2026. Decisions D1–D9 of the "
               "adoption audit were decided by the owner on 16 October 2026 "
               "(D4 deferred). Phase 0 awaits owner acceptance after stage "
               "0.9 (secrets, GIS behind its flag, versioning, documents).")
    rows = [["Part", "Source file"]] + [
        [title, f"`{path.relative_to(ROOT)}`"] for title, path in SECTIONS]
    md_to_docx.add_table(doc, rows)


def build() -> Path:
    missing = [str(path) for _title, path in SECTIONS if not path.exists()]
    if missing:
        raise SystemExit("Missing source files: " + ", ".join(missing))
    doc = vt.new_document("Phase 0 — Hardening and Hosting")
    vt.cover_page(
        doc,
        "Phase 0 — Hardening and Hosting",
        "Sprint S0 record and the Managed Development Standard adoption "
        "audit and plan",
        [("Product", "Vairiot Asset Intelligence"),
         ("Programme", "TUDA — Tbilisi Transport and Urban Development "
                       "Agency, sprints S0–S5"),
         ("Owner", "Don Scott, VAIRIOT FZCO"),
         ("Phase status", "S0 closed 6 October 2026; stage 0.8 decided "
                          "16 October 2026; awaiting acceptance"),
         ("Revision", f"{REVISION} ({REVISION_DATE})"),
         ("Version", "2.0.0 planned (decision D3)")],
    )
    vt.contents_page(doc)
    _summary(doc)
    for _title, path in SECTIONS:
        doc.add_paragraph().add_run().add_break(md_to_docx.WD_BREAK.PAGE)
        md_to_docx.convert(doc, path.read_text(encoding="utf-8"), IMAGES,
                           h1_page_break=False)
    doc.core_properties.title = ("Vairiot Asset Intelligence — Phase 0 "
                                 "Hardening and Hosting")
    doc.core_properties.author = "VAIRIOT FZCO"
    doc.core_properties.subject = "Vairiot Asset Intelligence"
    doc.core_properties.revision = 1
    doc.core_properties.version = REVISION
    doc.core_properties.language = "en-GB"
    doc.save(OUTPUT)
    return OUTPUT


if __name__ == "__main__":
    print(f"Written: {build()}")
