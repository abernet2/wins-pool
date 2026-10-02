#!/usr/bin/env python3
"""Fetch NFL regular-season data from ESPN.

Updates data/<season>/wins.json (record per team) and weeks.json (each team's result per
week: W / L / T). The season is the 'current' one in data/seasons.json (or argv[1]). Only rewrites a file when its content changed, so the
scheduled Action doesn't create empty commits. Does nothing (and succeeds) outside the
regular season, or before ESPN has the season. Stdlib only.
"""
import json, pathlib, sys, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent

def current_season_year():
    """NFL season year to fetch: argv[1], else the 'current' season in data/seasons.json ("2026-27" -> 2026)."""
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        return int(sys.argv[1])
    return int(json.loads((ROOT / "data" / "seasons.json").read_text())["current"][:4])

SEASON = current_season_year()
LABEL = f"{SEASON}-{(SEASON + 1) % 100:02d}"
URL = f"https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season={SEASON}&type=2"
SCOREBOARD = ("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
              f"?seasontype=2&dates={SEASON}")

class NotAvailable(Exception):
    """ESPN has no data for this season (yet). Not an error: the job just has nothing to do."""

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

def parse_standings(data, season=None):
    """(teams, window) from an ESPN standings payload. window is (start, end) of the regular season, or None."""
    season = season or SEASON
    got = (data.get("season") or {}).get("year")
    if got is None:
        raise NotAvailable(f"ESPN has no {season} season yet")
    if got != season:
        raise SystemExit(f"ESPN returned season {got} when {season} was requested")
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
    window = None
    for yr in data.get("seasons") or []:
        for t in yr.get("types", []):
            if yr.get("year") == season and t.get("id") == "2" and t.get("startDate") and t.get("endDate"):
                window = (t["startDate"], t["endDate"])
    return teams, window

def in_window(window, now, before=2, after=7):
    """True if `now` is within the regular season, give or take a few days. No window known -> assume yes."""
    if not window:
        return True
    parse = lambda x: datetime.strptime(x, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
    start, end = parse(window[0]), parse(window[1])
    return start - timedelta(days=before) <= now <= end + timedelta(days=after)

def get_json(url):
    # ESPN returns 403 for some custom User-Agents; Python's default is accepted.
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)

def parse_week(events):
    """(complete, {team: 'W'|'L'|'T'}) for the finished games in a week. A week with no games listed is not complete."""
    results = {}
    complete = bool(events)
    for e in events:
        if not e["status"]["type"]["completed"]:
            complete = False
            continue
        comps = e["competitions"][0]["competitors"]
        scores = {c["team"]["abbreviation"]: float(c["score"]) for c in comps}
        top = max(scores.values())
        for abbr, sc in scores.items():
            results[TEAMS[abbr]] = "T" if list(scores.values()).count(top) > 1 else ("W" if sc == top else "L")
    return complete, results

def fetch_week(week):
    data = get_json(f"{SCOREBOARD}&week={week}")
    if (data.get("season") or {}).get("year") != SEASON:
        return False, {}          # ESPN has nothing for this season/week
    return parse_week(data["events"])

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
    data = ROOT / "data" / LABEL
    changed = []

    try:
        teams, window = parse_standings(get_json(URL))
    except NotAvailable as e:
        print(f"{e}; nothing to do.")
        return
    if not in_window(window, datetime.now(timezone.utc)):
        print(f"Off-season (regular season {window[0][:10]} to {window[1][:10]}); nothing to do.")
        return
    teams = dict(sorted(teams.items()))

    wins_path = data / "wins.json"
    old = json.loads(wins_path.read_text()) if wins_path.exists() else {"season": LABEL, "teams": {}}
    if teams != old["teams"]:
        old["teams"] = teams
        old["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        data.mkdir(exist_ok=True)
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
