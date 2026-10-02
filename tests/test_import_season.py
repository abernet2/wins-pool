"""Tests for the sheet importer (no network). Run: python3 -m unittest discover -s tests -v"""
import json, pathlib, shutil, sys, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import import_season as imp

class Num(unittest.TestCase):
    def test_csv_export_formats(self):
        self.assertEqual(imp.num("58.3%"), 0.583)
        self.assertEqual(imp.num("$175.00"), 175.0)
        self.assertEqual(imp.num("-$25.00"), -25.0)
        self.assertEqual(imp.num("1,234"), 1234)
        self.assertEqual(imp.num("12"), 12)

    def test_text_is_left_alone(self):
        for s in ("2026-27", "L.A. Rams", "Mike B", "Relegated", ""):
            self.assertEqual(imp.num(s), s)
        self.assertEqual(imp.num(7), 7)          # Excel gives real numbers already

class Import(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        (self.tmp).mkdir(exist_ok=True)
        # the previous season supplies the league rules for a live import
        shutil.copytree(ROOT / "data" / "2025-26", self.tmp / "2025-26")
        (self.tmp / "seasons.json").write_text(json.dumps({"current": "2026-27", "seasons": ["2025-26", "2026-27"]}))
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_csv_of_the_live_season_reproduces_the_committed_draft(self):
        imp.main([str(ROOT / "data" / "sheets" / "2026-27.csv"), "--data-dir", str(self.tmp)])
        got = json.loads((self.tmp / "2026-27" / "league.json").read_text())
        want = json.loads((ROOT / "data" / "2026-27" / "league.json").read_text())
        by_name = lambda d: [{**lg, "owners": sorted(lg["owners"], key=lambda o: o["name"])} for lg in d["leagues"]]
        self.assertEqual(by_name(got), by_name(want))    # picks, owners (name, draft slot, historic win %), league rules
        self.assertNotIn("final", got)                   # the live season is computed by the page

    def test_refuses_to_overwrite_a_live_season_that_has_results(self):
        (self.tmp / "2026-27").mkdir()
        (self.tmp / "2026-27" / "weeks.json").write_text("{}")
        with self.assertRaises(SystemExit):
            imp.main([str(ROOT / "data" / "sheets" / "2026-27.csv"), "--data-dir", str(self.tmp)])
        imp.main([str(ROOT / "data" / "sheets" / "2026-27.csv"), "--data-dir", str(self.tmp), "--force"])   # but --force works

if __name__ == "__main__":
    unittest.main()
