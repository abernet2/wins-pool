#!/usr/bin/env python3
"""Fetch betting lines and final scores from nflverse's games.csv into data/<season>/games.json.

  scripts/fetch_lines.py                 the current season (data/seasons.json)
  scripts/fetch_lines.py 2025-26 2024-25 any seasons since 2018

nflverse (https://github.com/nflverse/nfldata, by Lee Sharpe) publishes one row per game with the closing spread,
total and moneylines, plus the score once it is final; it refreshes every half hour or so during the season.
Each game is stored as: week, date, home, away, spread (points the HOME team is favored by; negative = away favored;
null = no line yet), total, homeMl, awayMl, homeScore, awayScore (null until final). Regular season only.

Does nothing (and succeeds) if nflverse has no games for the season yet. Fails, writing nothing, if what it
downloaded is not a complete schedule. Only rewrites the file when the games changed. Stdlib only.
"""
import csv, io, json, pathlib, sys, urllib.request
from collections import Counter
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
HISTORIC = {"OAK": "Las Vegas", "SD": "L.A. Chargers", "STL": "L.A. Rams"}   # codes of franchises that have moved

def team_names(data=ROOT / "data"):
    names = {t["nflverse"]: t["name"] for t in json.loads((data / "teams.json").read_text())}
    return {**HISTORIC, **names}

def cell(row, key, cast):
    v = row.get(key, "")
    return None if v in ("", "NA") else cast(float(v)) if cast is int else cast(v)

def parse_games(text, year, names):
    """The regular-season games of one NFL season from nflverse's CSV text, in a stable order."""
    games = []
    for r in csv.DictReader(io.StringIO(text)):
        if r["season"] != str(year) or r["game_type"] != "REG":
            continue
        for side in ("home_team", "away_team"):
            if r[side] not in names:
                raise SystemExit(f"Unknown team code in the file: {r[side]!r}")
        games.append({
            "week": int(r["week"]), "date": r["gameday"], "home": names[r["home_team"]], "away": names[r["away_team"]],
            "spread": cell(r, "spread_line", float), "total": cell(r, "total_line", float),
            "homeMl": cell(r, "home_moneyline", int), "awayMl": cell(r, "away_moneyline", int),
            "homeScore": cell(r, "home_score", int), "awayScore": cell(r, "away_score", int),
        })
    return sorted(games, key=lambda g: (g["week"], g["date"], g["home"]))

def check(games, per_team):
    """A complete schedule: every team plays exactly `per_team` games, and a score is either both-or-neither."""
    seen = Counter(t for g in games for t in (g["home"], g["away"]))
    if len(seen) != 32 or any(n != per_team for n in seen.values()):
        raise SystemExit(f"Not a complete schedule: {len(games)} games; games per team: {sorted(set(seen.values()))} (expected {per_team})")
    for g in games:
        if (g["homeScore"] is None) != (g["awayScore"] is None):
            raise SystemExit(f"Half a score for {g['away']} @ {g['home']} week {g['week']}")
    return games

def write(path, season, games):
    """One game per line, so a diff shows exactly which games changed."""
    body = ",\n".join("  " + json.dumps(g, separators=(",", ":")) for g in games)
    path.write_text(f'{{\n "season": {json.dumps(season)},\n "source": "nflverse/nfldata games.csv",\n "updated": {json.dumps(datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))},\n "games": [\n{body}\n ]\n}}\n')

def main(argv):
    data = ROOT / "data"
    labels = argv or [json.loads((data / "seasons.json").read_text())["current"]]
    with urllib.request.urlopen(URL, timeout=60) as r:
        text = r.read().decode("utf-8")
    names = team_names(data)
    for label in labels:
        year = int(label[:4])
        games = parse_games(text, year, names)
        if not games:
            print(f"{label}: nflverse has no games yet; nothing to do.")
            continue
        check(games, per_team=16 if year < 2021 else 17)
        path = data / label / "games.json"
        if path.exists() and json.loads(path.read_text())["games"] == games:
            print(f"{label}: no changes ({len(games)} games).")
            continue
        path.parent.mkdir(exist_ok=True)
        write(path, label, games)
        lines = sum(g["spread"] is not None for g in games); final = sum(g["homeScore"] is not None for g in games)
        print(f"{label}: wrote {len(games)} games ({lines} with lines, {final} final).")

if __name__ == "__main__":
    main(sys.argv[1:])
