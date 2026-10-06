"""Tests for scripts/profile-register.py.

    python3 -m unittest discover -s scripts/tests -v
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

import openpyxl

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("profile_register", SCRIPTS / "profile-register.py")
pr = importlib.util.module_from_spec(spec)
sys.modules["profile_register"] = pr
spec.loader.exec_module(pr)

SAMPLE = SCRIPTS / "samples" / "register-sample.xlsx"
TODAY = dt.date(2026, 10, 6)


class ParseNumber(unittest.TestCase):
    def test_numbers_in_the_formats_registers_use(self):
        cases = {
            "1234.5": 1234.5, "1 234,50": 1234.5, "1,234.50": 1234.5, "1.234,50": 1234.5,
            "12,5": 12.5, "1,234,567": 1234567, "1.234.567": 1234567, "₾100": 100,
            "100 GEL": 100, "511 310,59": 511310.59, "-5": -5, 42: 42.0, 3.5: 3.5,
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertAlmostEqual(pr.parse_number(raw), expected)

    def test_not_numbers(self):
        for raw in ["n/a", "TBC", "12,5,0", "", "1.2.3", True, None, "approx 100"]:
            with self.subTest(raw=raw):
                self.assertIsNone(pr.parse_number(raw))


class ParseDate(unittest.TestCase):
    def test_dates(self):
        cases = {
            "2015-03-01": dt.date(2015, 3, 1), "01.03.2015": dt.date(2015, 3, 1), "01/03/2015": dt.date(2015, 3, 1),
            dt.datetime(2015, 3, 1, 10, 0): dt.date(2015, 3, 1), 42064: dt.date(2015, 3, 1),  # Excel serial
            "01.03.15": dt.date(2015, 3, 1),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(pr.parse_date(raw), expected)

    def test_not_dates(self):
        for raw in ["soon", "", "31.02.2015", None, 10_000_000]:
            with self.subTest(raw=raw):
                self.assertIsNone(pr.parse_date(raw))


class Mapping(unittest.TestCase):
    def test_english_georgian_and_russian_headers(self):
        mapping = pr.suggest_mapping([
            "Inventory No", "დასახელება", "Стоимость", "Дата приобретения", "Serial Number", "Something else",
        ])
        fields = [m["field"] for m in mapping]
        self.assertEqual(fields, ["legacyAssetNumber", "name", "purchaseCost", "purchaseDate", "serialNumber", None])

    def test_each_field_used_once(self):
        mapping = pr.suggest_mapping(["Name", "Asset name"])
        self.assertEqual(sorted(str(m["field"]) for m in mapping), ["None", "name"])

    def test_fields_without_an_importer_target_are_flagged(self):
        (m,) = pr.suggest_mapping(["Inventory number"])
        self.assertFalse(m["importable"])
        self.assertIn("note", m)


class SampleRegister(unittest.TestCase):
    """The planted problems in samples/register-sample.xlsx, found exactly."""

    @classmethod
    def setUpClass(cls):
        cls.p = pr.profile(SAMPLE, today=TODAY)

    def rows(self, check):
        return sorted(i.row for i in self.p.issues if i.check == check)

    def test_shape(self):
        self.assertEqual(self.p.header_row, 3)  # title row and a blank row above it
        self.assertEqual(self.p.rows, 70)
        self.assertEqual(len(self.p.columns), 9)

    def test_duplicate_asset_numbers(self):
        self.assertEqual(self.rows("Duplicate asset number"), [20, 41, 55, 61])

    def test_blank_names(self):
        self.assertEqual(self.rows("Blank asset name"), [12, 33, 47])

    def test_costs_that_are_not_numbers(self):
        # "n/a" included: pandas would read it as blank unless told not to.
        self.assertEqual(self.rows("Cost is not a number"), [18, 29, 64])

    def test_dates_out_of_range(self):
        self.assertEqual(self.rows("Date out of range"), [26, 38])

    def test_no_false_alarms(self):
        checks = {i.check for i in self.p.issues}
        self.assertEqual(checks, {"Duplicate asset number", "Blank asset name", "Cost is not a number", "Date out of range"})

    def test_column_types(self):
        types = {c["field"]: c["type"] for c in self.p.columns}
        self.assertEqual(types["purchaseDate"], "date")
        self.assertEqual(types["purchaseCost"], "number")
        self.assertEqual(types["name"], "text")


class EndToEnd(unittest.TestCase):
    def test_cli_writes_report_and_mapping(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, mapping = Path(tmp) / "r.xlsx", Path(tmp) / "m.json"
            self.assertEqual(pr.main([str(SAMPLE), "--out", str(out), "--mapping", str(mapping)]), 0)
            wb = openpyxl.load_workbook(out)
            self.assertEqual(wb.sheetnames, ["Summary", "Columns", "Issues", "Mapping"])
            for ws in wb.worksheets:
                self.assertEqual(ws.page_setup.orientation, "landscape")
                self.assertEqual(int(ws.page_setup.paperSize), 9)  # A4
            doc = json.loads(mapping.read_text(encoding="utf-8"))
            self.assertEqual(doc["headerRow"], 3)
            self.assertEqual(len(doc["mappings"]), 9)

    def test_windows_1251_csv_with_russian_headers(self):
        with tempfile.TemporaryDirectory() as tmp:
            csv = Path(tmp) / "реестр.csv"
            csv.write_bytes(
                "Инвентарный номер;Наименование;Стоимость;Дата приобретения\n"
                "A-1;Автобус;380 000,00;01.03.2015\nA-1;;н/д;01.03.1980\n".encode("cp1251")
            )
            p = pr.profile(csv, today=TODAY)
            self.assertEqual(p.read_as, "CSV (cp1251)")
            self.assertEqual([m["field"] for m in p.mapping], ["legacyAssetNumber", "name", "purchaseCost", "purchaseDate"])
            self.assertEqual({i.check for i in p.issues},
                             {"Duplicate asset number", "Blank asset name", "Cost is not a number", "Date out of range"})

    def test_explicit_header_row(self):
        p = pr.profile(SAMPLE, header_row=3, today=TODAY)
        self.assertEqual(p.header_row, 3)


if __name__ == "__main__":
    unittest.main()
