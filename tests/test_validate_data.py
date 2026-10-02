"""The data validator must accept the real data and catch each kind of damage. Run: python3 -m unittest discover -s tests"""
import json, pathlib, shutil, sys, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from validate_data import validate

class Validate(unittest.TestCase):
    def setUp(self):
        self.d = pathlib.Path(tempfile.mkdtemp())
        shutil.copytree(ROOT / "data", self.d, dirs_exist_ok=True, ignore=shutil.ignore_patterns("sheets"))
        self.addCleanup(shutil.rmtree, self.d)

    def edit(self, rel, fn):
        p = self.d / rel
        data = json.loads(p.read_text()); fn(data); p.write_text(json.dumps(data))

    def errors(self):
        return validate(self.d)[0]

    def test_real_data_is_clean(self):
        self.assertEqual(self.errors(), [])

    def test_missing_pick(self):
        self.edit("2025-26/league.json", lambda d: d["leagues"][0]["picks"].pop())
        self.assertTrue(any("picks" in e for e in self.errors()), self.errors())

    def test_team_picked_twice(self):
        def dup(d): d["leagues"][0]["picks"][1]["team"] = d["leagues"][0]["picks"][0]["team"]
        self.edit("2025-26/league.json", dup)
        self.assertTrue(any("exactly once" in e for e in self.errors()))

    def test_owner_with_wrong_number_of_picks(self):
        def move(d): d["leagues"][0]["picks"][0]["owner"] = d["leagues"][0]["picks"][1]["owner"]
        self.edit("2024-25/league.json", move)
        self.assertTrue(any("expected 4" in e for e in self.errors()))

    def test_unknown_team_in_records(self):
        def rename(d): d["teams"]["Seatle"] = d["teams"].pop("Seattle")
        self.edit("2023-24/wins.json", rename)
        self.assertTrue(any("wins.json teams differ" in e for e in self.errors()))

    def test_negative_record(self):
        self.edit("2023-24/wins.json", lambda d: d["teams"]["Seattle"].update(w=-1))
        self.assertTrue(any("bad record" in e for e in self.errors()))

    def test_finished_season_missing_a_rank(self):
        def drop(d): del d["leagues"][0]["owners"][0]["rank"]
        self.edit("2025-26/league.json", drop)
        self.assertTrue(any("rank" in e for e in self.errors()))

    def with_weeks(self, weeks):
        self.edit("2026-27/weeks.json", lambda d: d.update(weeks={n: {"complete": c, "results": {"Seattle": "W"}} for n, c in weeks.items()}))

    def test_weekly_results_that_are_in_order_are_accepted(self):
        self.with_weeks({"1": True, "2": True, "3": False})
        self.assertEqual(self.errors(), [])

    def test_gap_in_weekly_results(self):
        self.with_weeks({"1": True, "3": True})
        self.assertTrue(any("gaps" in e for e in self.errors()))

    def test_unfinished_week_followed_by_a_later_week(self):
        self.with_weeks({"1": False, "2": True})
        self.assertTrue(any("unfinished but a later week exists" in e for e in self.errors()))

if __name__ == "__main__":
    unittest.main()
