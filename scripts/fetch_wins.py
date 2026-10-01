#!/usr/bin/env python3
"""Fetch current NFL regular-season records from ESPN and update data/wins.json.

Only rewrites the file when a team's record actually changed, so the scheduled
Action doesn't create empty commits. Stdlib only.
"""
import json, pathlib, sys, urllib.request
from datetime import datetime, timezone

SEASON = 2026  # NFL season year (the 2026-27 pool)
URL = f"https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season={SEASON}&type=2"

# ESPN abbreviation -> team name used in league.json
TEAMS = {
    "ARI": "Arizona", "ATL": "Atlanta", "BAL": "Baltimore", "BUF": "Buffalo", "CAR": "Carolina",
    "CHI": "Chicago", "CIN": "Cincinnati", "CLE": "Cleveland", "DAL": "Dallas", "DEN": "Denver",
    "DET": "Detroit", "GB": "Green Bay", "HOU": "Houston", "IND": "Indianapolis", "JAX": "Jacksonville",
    "KC": "Kansas City", "LAC": "L.A. Chargers", "LAR": "L.A. Rams", "LV": "Las Vegas", "MIA": "Miami",
    "MIN": "Minnesota", "NE": "New England", "NO": "New Orleans", "NYG": "N.Y. Giants", "NYJ": "N.Y. Jets",
    "PHI": "Philadelphia", "PIT": "Pittsburgh", "SEA": "Seattle", "SF": "San Francisco",
    "TB": "Tampa Bay", "TEN": "Tennessee", "WSH": "Washington",
}

def fetch():
    # ESPN returns 403 for some custom User-Agents; Python's default is accepted.
    with urllib.request.urlopen(URL, timeout=30) as r:
        data = json.load(r)
    teams = {}
    for conf in data["children"]:
        for e in conf["standings"]["entries"]:
            name = TEAMS.get(e["team"]["abbreviation"])
            if not name:
                raise SystemExit(f"Unknown team abbreviation: {e['team']['abbreviation']}")
            s = {x["name"]: int(x.get("value") or 0) for x in e["stats"]}
            teams[name] = {"w": s.get("wins", 0), "l": s.get("losses", 0), "t": s.get("ties", 0)}
    if set(teams) != set(TEAMS.values()):
        raise SystemExit(f"Expected 32 teams, got {len(teams)}")
    return teams

def main():
    path = pathlib.Path(__file__).resolve().parent.parent / "data" / "wins.json"
    old = json.loads(path.read_text())
    teams = fetch()
    if teams == old["teams"]:
        print("No changes.")
        return
    old["teams"] = dict(sorted(teams.items()))
    old["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path.write_text(json.dumps(old, indent=2) + "\n")
    print("Updated wins.json")

if __name__ == "__main__":
    main()
