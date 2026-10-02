#!/usr/bin/env python3
"""Check that everything under data/ is consistent. Exits non-zero on any error (warnings don't fail).

  scripts/validate_data.py [--data-dir DIR]

Per season and league: every owner has exactly 4 picks, picks are numbered 1..n once each and cover every NFL team
exactly once, team and owner names are known, each team's record is a non-negative W/L/T. Finished seasons must carry
every owner's rank. The live season's weekly results must reference real teams, have no gaps, and only the last week
may be unfinished. Owner names that appear in a single season are listed as warnings (a likely misspelling).
"""
import json, pathlib, sys
from collections import Counter

def validate(data):
    errors, warnings = [], []
    err = errors.append
    load = lambda p: json.loads(p.read_text())

    teams = load(data / "teams.json")
    names = [t["name"] for t in teams]
    if len(teams) != 32: err(f"teams.json: expected 32 teams, found {len(teams)}")
    for key in ("name", "abbr", "espn"):
        dup = [v for v, n in Counter(t[key] for t in teams).items() if n > 1]
        if dup: err(f"teams.json: duplicate {key}: {dup}")
    known = set(names)

    idx = load(data / "seasons.json")
    if idx["current"] not in idx["seasons"]: err(f"seasons.json: current season {idx['current']} is not in the list")
    owner_seasons = Counter()

    for season in idx["seasons"]:
        d = data / season
        if not (d / "league.json").exists() or not (d / "wins.json").exists():
            err(f"{season}: missing league.json or wins.json"); continue
        league, wins = load(d / "league.json"), load(d / "wins.json")
        if league.get("season") != season: err(f"{season}: league.json says season {league.get('season')}")
        if wins.get("season") != season: err(f"{season}: wins.json says season {wins.get('season')}")

        if set(wins["teams"]) != known:
            err(f"{season}: wins.json teams differ from teams.json (missing {sorted(known - set(wins['teams']))}, extra {sorted(set(wins['teams']) - known)})")
        for t, r in wins["teams"].items():
            if not all(isinstance(r.get(k), int) and r[k] >= 0 for k in "wlt"): err(f"{season}: bad record for {t}: {r}")

        finished = season != idx["current"]
        if finished and not league.get("final"): warnings.append(f"{season}: finished season is not marked final (run scripts/finalize-season.js {season})")
        for lg in league["leagues"]:
            at = f"{season} {lg['name']}"
            owners = [o["name"] for o in lg["owners"]]
            if len(set(owners)) != len(owners): err(f"{at}: duplicate owner names")
            owner_seasons.update(set(owners))
            per = Counter(p["owner"] for p in lg["picks"])
            for o in owners:
                if per[o] != 4: err(f"{at}: {o} has {per[o]} picks, expected 4")
            for o in per:
                if o not in owners: err(f"{at}: picks reference unknown owner {o}")
            if sorted(p["pick"] for p in lg["picks"]) != list(range(1, len(lg["picks"]) + 1)): err(f"{at}: pick numbers are not 1..{len(lg['picks'])}")
            picked = Counter(p["team"] for p in lg["picks"])
            if set(picked) != known or any(n != 1 for n in picked.values()):
                err(f"{at}: picks must cover every team exactly once (missing {sorted(known - set(picked))}, repeated {[t for t, n in picked.items() if n > 1]}, unknown {sorted(set(picked) - known)})")
            if len(lg["picks"]) != 4 * len(owners): err(f"{at}: {len(lg['picks'])} picks for {len(owners)} owners")
            if any("hist" not in o for o in lg["owners"]) and not finished: err(f"{at}: an owner is missing historic win % (hist)")
            if finished:
                ranks = sorted(o.get("rank", 0) for o in lg["owners"])
                if not ranks or ranks[0] < 1 or ranks[-1] > len(owners) or 0 in ranks: err(f"{at}: finished season needs every owner's rank (1..{len(owners)}); got {ranks}")

        if not finished and (d / "weeks.json").exists():
            weeks = load(d / "weeks.json")["weeks"]
            nums = sorted(int(n) for n in weeks)
            if nums != list(range(1, len(nums) + 1)): err(f"{season}: weeks.json has gaps: {nums}")
            for n in nums[:-1]:
                if not weeks[str(n)]["complete"]: err(f"{season}: week {n} is unfinished but a later week exists")
            for n, wk in weeks.items():
                bad = set(wk["results"]) - known
                if bad: err(f"{season} week {n}: unknown teams {sorted(bad)}")

    once = sorted(o for o, n in owner_seasons.items() if n == 1)
    if once: warnings.append(f"owners seen in only one season (misspelled?): {once}")
    return errors, warnings

if __name__ == "__main__":
    data = pathlib.Path(sys.argv[sys.argv.index("--data-dir") + 1]) if "--data-dir" in sys.argv else pathlib.Path(__file__).resolve().parent.parent / "data"
    errors, warnings = validate(data)
    for w in warnings: print("warning:", w)
    for e in errors: print("ERROR:", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)
