"""Tests for the ESPN fetch script's parsing and season logic (no network).
Run: python3 -m unittest discover -s tests -v"""
import pathlib, sys, unittest
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
import fetch_wins as fw

def event(home, away, hs, as_, completed=True):
    return {"status": {"type": {"completed": completed}},
            "competitions": [{"competitors": [{"team": {"abbreviation": home}, "score": str(hs)},
                                              {"team": {"abbreviation": away}, "score": str(as_)}]}]}

def standings(year, window=("2026-09-06T07:00Z", "2027-01-13T07:59Z")):
    entries = [{"team": {"abbreviation": a}, "stats": [{"name": "wins", "value": 1}, {"name": "losses", "value": 2}, {"name": "ties", "value": 0}]}
               for a in fw.TEAMS]
    return {"season": {"year": year} if year else None, "children": [{"standings": {"entries": entries}}],
            "seasons": [{"year": 2026, "types": [{"id": "2", "startDate": window[0], "endDate": window[1]}]}]}

class ParseWeek(unittest.TestCase):
    def test_no_games_listed_is_not_complete(self):
        # The bug: an empty week used to count as complete and was never fetched again.
        self.assertEqual(fw.parse_week([]), (False, {}))

    def test_all_final_is_complete(self):
        complete, r = fw.parse_week([event("SEA", "NE", 13, 10), event("SF", "LAR", 27, 7)])
        self.assertTrue(complete)
        self.assertEqual(r, {"Seattle": "W", "New England": "L", "San Francisco": "W", "L.A. Rams": "L"})

    def test_unfinished_game_keeps_week_open(self):
        complete, r = fw.parse_week([event("SEA", "NE", 13, 10), event("SF", "LAR", 0, 0, completed=False)])
        self.assertFalse(complete)
        self.assertEqual(set(r), {"Seattle", "New England"})   # only the finished game counts

    def test_tie(self):
        _, r = fw.parse_week([event("SEA", "NE", 20, 20)])
        self.assertEqual(r, {"Seattle": "T", "New England": "T"})

class ParseStandings(unittest.TestCase):
    def test_reads_records_and_window(self):
        teams, window = fw.parse_standings(standings(2026), 2026)
        self.assertEqual(len(teams), 32)
        self.assertEqual(teams["Seattle"], {"w": 1, "l": 2, "t": 0})
        self.assertEqual(window, ("2026-09-06T07:00Z", "2027-01-13T07:59Z"))

    def test_season_espn_does_not_have_is_not_an_error(self):
        with self.assertRaises(fw.NotAvailable):
            fw.parse_standings(standings(None), 2027)

    def test_wrong_season_is_rejected(self):
        # ESPN has been seen returning a different season than the one requested; never write that.
        with self.assertRaises(SystemExit):
            fw.parse_standings(standings(2026), 2027)

    def test_missing_team_is_rejected(self):
        data = standings(2026)
        data["children"][0]["standings"]["entries"].pop()
        with self.assertRaises(SystemExit):
            fw.parse_standings(data, 2026)

class InWindow(unittest.TestCase):
    W = ("2026-09-06T07:00Z", "2027-01-13T07:59Z")
    at = staticmethod(lambda y, m, d: datetime(y, m, d, 12, tzinfo=timezone.utc))

    def test_in_season(self):
        self.assertTrue(fw.in_window(self.W, self.at(2026, 10, 1)))

    def test_just_before_and_after_are_allowed(self):
        self.assertTrue(fw.in_window(self.W, self.at(2026, 9, 5)))
        self.assertTrue(fw.in_window(self.W, self.at(2027, 1, 19)))

    def test_offseason(self):
        self.assertFalse(fw.in_window(self.W, self.at(2027, 6, 1)))
        self.assertFalse(fw.in_window(self.W, self.at(2026, 7, 1)))

    def test_unknown_window_fails_open(self):
        self.assertTrue(fw.in_window(None, self.at(2027, 6, 1)))

if __name__ == "__main__":
    unittest.main()
