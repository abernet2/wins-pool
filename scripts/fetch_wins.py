#!/usr/bin/env python3
"""Fetch NFL regular-season data from ESPN.

Updates data/wins.json (season record per team) and data/weeks.json (each team's
result per week: W / L / T). Only rewrites a file when its content changed, so the
scheduled Action doesn't create empty commits. Stdlib only.
"""
import json, pathlib, sys, urllib.request
from datetime import datetime, timezone

SEASON = 2026  # NFL season year (the 2026-27 pool)
URL = f"https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season={SEASON}&type=2"
SCOREBOARD = ("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
              f"?seasontype=2&dates={SEASON}")

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
    data = get_json(URL)
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

def get_json(url):
    # ESPN returns 403 for some custom User-Agents; Python's default is accepted.
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)

def fetch_week(week):
    """Return (complete, {team: 'W'|'L'|'T'}) for finished games in a week."""
    events = get_json(f"{SCOREBOARD}&week={week}")["events"]
    results, complete = {}, True
    for e in events:
        if not e["status"]["type"]["completed"]:
            complete = False
            continue
        comps = e["competitions"][0]["competitors"]
        scores = {c["team"]["abbreviation"]: float(c["score"]) for c in comps}
        top = max(scores.values())
        for abbr, sc in scores.items():
            name = TEAMS[abbr]
            results[name] = "T" if list(scores.values()).count(top) > 1 else ("W" if sc == top else "L")
    return complete, results

def fetch_weeks(existing):
    """Fetch weeks in order, skipping ones already complete, and stop at the first
    unfinished week (the current one). 18 regular-season weeks."""
    weeks = {}
    for w in range(1, 19):
        stored = existing.get("weeks", {}).get(str(w))
        if stored and stored["complete"]:
            weeks[str(w)] = stored
            continue
        complete, results = fetch_week(w)
        if not results and not complete:
            break  # week hasn't started yet
        weeks[str(w)] = {"complete": complete, "results": dict(sorted(results.items()))}
        if not complete:
            break
    return weeks

def write_if_changed(path, new):
    old = json.loads(path.read_text()) if path.exists() else None
    if old == new:
        return False
    path.write_text(json.dumps(new, indent=2) + "\n")
    return True

def main():
    data = pathlib.Path(__file__).resolve().parent.parent / "data"
    changed = []

    wins_path = data / "wins.json"
    old = json.loads(wins_path.read_text())
    teams = dict(sorted(fetch().items()))
    if teams != old["teams"]:
        old["teams"] = teams
        old["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        wins_path.write_text(json.dumps(old, indent=2) + "\n")
        changed.append("wins.json")

    weeks_path = data / "weeks.json"
    existing = json.loads(weeks_path.read_text()) if weeks_path.exists() else {}
    weeks = fetch_weeks(existing)
    if write_if_changed(weeks_path, {"season": old["season"], "weeks": weeks}):
        changed.append("weeks.json")

    # Sanity check: weekly results should add up to the standings.
    for name, rec in teams.items():
        got = [sum(1 for wk in weeks.values() if wk["results"].get(name) == x) for x in "WLT"]
        if got != [rec["w"], rec["l"], rec["t"]]:
            print(f"warning: {name} weekly results {got} != standings {[rec['w'], rec['l'], rec['t']]}", file=sys.stderr)

    print("Updated " + ", ".join(changed) if changed else "No changes.")

if __name__ == "__main__":
    main()
