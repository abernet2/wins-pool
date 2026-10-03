"""Tests for the betting-lines fetch script's parsing and checks (no network). Run: python3 -m unittest discover -s tests"""
import json, pathlib, sys, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_lines as fl

HEADER = "game_id,season,game_type,week,gameday,away_team,away_score,home_team,home_score,away_moneyline,home_moneyline,spread_line,total_line"
NAMES = fl.team_names()

def csv_text(*rows): return "\n".join([HEADER, *rows]) + "\n"

class Parse(unittest.TestCase):
    def test_a_final_game_with_lines(self):
        g = fl.parse_games(csv_text("x,2026,REG,1,2026-09-09,NE,10,SEA,13,140,-166,3,44.5"), 2026, NAMES)
        self.assertEqual(g, [{"week": 1, "date": "2026-09-09", "home": "Seattle", "away": "New England", "spread": 3.0, "total": 44.5,
                              "homeMl": -166, "awayMl": 140, "homeScore": 13, "awayScore": 10}])

    def test_unplayed_game_has_null_scores_and_missing_lines_are_null(self):
        g = fl.parse_games(csv_text("x,2026,REG,9,2026-11-08,NE,NA,SEA,NA,NA,NA,NA,NA", "y,2026,REG,9,2026-11-08,DAL,,GB,,,,,"), 2026, NAMES)
        self.assertTrue(all(x["homeScore"] is None and x["spread"] is None and x["homeMl"] is None for x in g))

    def test_only_regular_season_games_of_the_requested_year(self):
        g = fl.parse_games(csv_text("a,2026,REG,1,2026-09-09,NE,1,SEA,2,,,,", "b,2026,POST,19,2027-01-16,NE,1,SEA,2,,,,", "c,2025,REG,1,2025-09-09,NE,1,SEA,2,,,,"), 2026, NAMES)
        self.assertEqual([x["week"] for x in g], [1])

    def test_codes_that_changed_names_map_to_todays_team(self):
        g = fl.parse_games(csv_text("a,2019,REG,1,2019-09-09,OAK,1,LA,2,,,,", "b,2026,REG,1,2026-09-09,LAR,1,LV,2,,,,"), 2019, NAMES)
        self.assertEqual((g[0]["away"], g[0]["home"]), ("Las Vegas", "L.A. Rams"))

    def test_unknown_team_code_is_rejected(self):
        with self.assertRaises(SystemExit):
            fl.parse_games(csv_text("a,2026,REG,1,2026-09-09,XXX,1,SEA,2,,,,"), 2026, NAMES)

    def test_stable_order(self):
        g = fl.parse_games(csv_text("b,2026,REG,2,2026-09-16,NE,1,SEA,2,,,,", "a,2026,REG,1,2026-09-09,DAL,1,GB,2,,,,"), 2026, NAMES)
        self.assertEqual([x["week"] for x in g], [1, 2])

class Check(unittest.TestCase):
    def schedule(self, n):
        names = sorted(set(NAMES.values()))[:32]
        return [{"week": 1, "date": "d", "home": names[i], "away": names[i + 16], "spread": None, "total": None, "homeMl": None,
                 "awayMl": None, "homeScore": None, "awayScore": None} for i in range(16)] * n

    def test_complete_schedule_passes(self):
        self.assertEqual(len(fl.check(self.schedule(1), per_team=1)), 16)

    def test_a_team_with_too_few_games_is_rejected(self):
        games = self.schedule(1); games.pop()
        with self.assertRaises(SystemExit): fl.check(games, per_team=1)

    def test_half_a_score_is_rejected(self):
        games = self.schedule(1); games[0]["homeScore"] = 7
        with self.assertRaises(SystemExit): fl.check(games, per_team=1)

class Shipped(unittest.TestCase):
    def test_the_committed_season_file_is_a_complete_schedule(self):
        f = json.loads((ROOT / "data" / "2026-27" / "games.json").read_text())
        self.assertEqual(len(fl.check(f["games"], per_team=17)), 272)
        self.assertEqual({g["week"] for g in f["games"]}, set(range(1, 19)))

if __name__ == "__main__":
    unittest.main()
