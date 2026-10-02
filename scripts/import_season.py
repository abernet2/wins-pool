#!/usr/bin/env python3
"""Import a season from the pool's sheet into data/<season>/league.json and wins.json.

  scripts/import_season.py "NFL Wins Pool - 2026-27 Season.csv"     one season (a CSV export of one tab)
  scripts/import_season.py "NFL Wins Pool.xlsx" [2022-23 ...]        every season tab (or just those named)

Options:  --data-dir DIR   write somewhere other than ./data (used by the tests)
          --force          allow overwriting the live season that already has results

The left block of a tab (cols A-J) has the picks and each team's record; the right block has each owner's results
(rank, net $, promoted/relegated), whose columns vary between years, so they are found by header name.

* A FINISHED season keeps those results (rank, net, move) and is marked "final".
* The CURRENT season (data/seasons.json) is live: results are computed by the page, so only the draft and each owner's
  historic win % are kept, and the league rules (buy-in, promotion/relegation counts) are carried over from the
  previous season. Importing it again after games have been recorded would overwrite the live results, so that is
  refused without --force.

.xlsx needs openpyxl (pip install openpyxl); .csv needs nothing. Registers the season in data/seasons.json.
"""
import csv, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
NUM = re.compile(r"^-?\$?-?[\d,]*\.?\d+%?$")

def num(v):
    """Sheet cells -> numbers: CSV exports give '58.3%', '$175.00', '-$25.00'; Excel already gives numbers."""
    if not isinstance(v, str):
        return v
    s = v.strip()
    if not s or not NUM.match(s):
        return s
    pct = s.endswith("%")
    x = float(s.replace("$", "").replace(",", "").rstrip("%"))
    return x / 100 if pct else (int(x) if x == int(x) and "." not in s else x)

INT = lambda v: int(v) if v not in (None, "") else 0
isnum = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)

def parse_tab(rows, season):
    """rows: a tab as lists of cells -> (picks by league, team records, owners by league)."""
    rows = [[num(c) for c in r] for r in rows]
    picks, records = {}, {}
    for r in rows[1:]:
        if r[0] == season and isnum(r[1]):
            lg = int(r[1])
            picks.setdefault(lg, []).append({"pick": INT(r[2]), "team": r[3], "owner": r[4]})
            records[r[3]] = {"w": INT(r[5]), "l": INT(r[6]), "t": INT(r[7])}

    hdr = {str(v).strip(): i for i, v in enumerate(rows[0]) if v not in (None, "") and i >= 10}
    col = lambda *names: next((hdr[n] for n in names if n in hdr), None)
    c_owner, c_slot = col("Owner"), col("Pick")
    c_w, c_l, c_t = col("Wins"), col("Losses"), col("Ties")
    c_hist, c_rank, c_net, c_tag, c_lg = col("Hist. %"), col("Rank", "Win Rk"), col("Net $ (Raw)"), col("Pro / Rel?"), col("League")

    owners, cur = {}, 1
    for r in rows[1:]:
        r = r + [None] * (30 - len(r))
        if c_lg is not None and isnum(r[c_lg]):
            cur = int(r[c_lg])
        name = r[c_owner]
        if not name or name in ("Owner", "TOTAL", "AVG") or not isnum(r[c_slot]):
            continue
        o = {"name": name, "draftSlot": INT(r[c_slot]), "rank": INT(r[c_rank]), "net": round(float(r[c_net] or 0), 2)}
        if c_hist is not None and isnum(r[c_hist]):
            o["hist"] = round(float(r[c_hist]), 4)
        tag = str(r[c_tag] or "").strip().lower() if c_tag is not None else ""
        if tag in ("relegated", "promoted"):
            o["move"] = tag
        o["_w"], o["_l"], o["_t"] = INT(r[c_w]), INT(r[c_l]), INT(r[c_t])
        owners.setdefault(cur, []).append(o)
    return picks, records, owners

def previous_rules(data, season, lg_id):
    """(buyIn, relegate, promote) for a league, from the latest earlier season that had it."""
    for sn in sorted((p.name for p in data.glob("20??-??") if p.name < season), reverse=True):
        f = data / sn / "league.json"
        for lg in json.loads(f.read_text())["leagues"] if f.exists() else []:
            if lg["id"] == lg_id:
                return lg["buyIn"], lg["relegate"], lg["promote"]
    raise SystemExit(f"No earlier season has league {lg_id}, so its buy-in and promotion/relegation counts are unknown.")

def build(season, picks, records, owners, live, data):
    leagues = []
    for lg in sorted(picks):
        owns = owners[lg]
        for o in owns:   # sanity check: the sheet's own totals must equal the sum of that owner's picks
            mine = [p["team"] for p in picks[lg] if p["owner"] == o["name"]]
            got = tuple(sum(records[t][k] for t in mine) for k in "wlt")
            if len(mine) != 4 or got != (o["_w"], o["_l"], o["_t"]):
                print(f"  warning {season} L{lg} {o['name']}: {len(mine)} picks, sum {got} vs sheet {(o['_w'], o['_l'], o['_t'])}")
            for k in ("_w", "_l", "_t"):
                del o[k]
        if live:
            buy, rel, pro = previous_rules(data, season, lg)
            owns = [{k: v for k, v in o.items() if k in ("name", "draftSlot", "hist")} for o in owns]
        else:
            buy = round(-min(o["net"] for o in owns), 2)
            rel, pro = sum(o.get("move") == "relegated" for o in owns), sum(o.get("move") == "promoted" for o in owns)
        leagues.append({"id": lg, "name": f"League {lg}", "buyIn": buy, "relegate": rel, "promote": pro,
                        "owners": sorted(owns, key=lambda o: o["draftSlot"]), "picks": picks[lg]})
    league = {"season": season, "leagues": leagues}
    if not live:
        league["final"] = True
    return league

def read_tabs(path, wanted):
    """Yield (season, rows) for each season tab in a .csv or .xlsx file."""
    if path.suffix.lower() == ".csv":
        rows = list(csv.reader(path.open(newline="")))
        yield rows[1][0], rows
        return
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    for ws in wb.worksheets:
        if ws.title.endswith(" Season") and (not wanted or ws.title.split()[0] in wanted):
            yield ws.title.split()[0], [list(r) for r in ws.iter_rows(values_only=True)]

def main(argv):
    args, force, data = [], False, ROOT / "data"
    it = iter(argv)
    for a in it:
        if a == "--force": force = True
        elif a == "--data-dir": data = pathlib.Path(next(it))
        else: args.append(a)
    if not args:
        raise SystemExit(__doc__)
    path, wanted = pathlib.Path(args[0]), set(args[1:])
    idx_path = data / "seasons.json"
    idx = json.loads(idx_path.read_text())
    imported = []
    for season, rows in read_tabs(path, wanted):
        # An .xlsx import skips the live season unless it is named; a .csv is always an explicit choice.
        live = season == idx["current"]
        if live and path.suffix.lower() == ".xlsx" and season not in wanted:
            continue
        out = data / season
        if live and (out / "weeks.json").exists() and not force:
            raise SystemExit(f"{season} is the live season and already has results; importing would overwrite them. Use --force if you mean it.")
        picks, records, owners = parse_tab(rows, season)
        league = build(season, picks, records, owners, live, data)
        out.mkdir(exist_ok=True)
        (out / "league.json").write_text(json.dumps(league, indent=2) + "\n")
        (out / "wins.json").write_text(json.dumps({"season": season, "teams": dict(sorted(records.items()))}, indent=2) + "\n")
        imported.append(season)
        print(f"{season}{' (live)' if live else ''}: {len(league['leagues'])} league(s), {sum(len(l['owners']) for l in league['leagues'])} owners, {len(records)} teams")
    idx["seasons"] = sorted(set(idx["seasons"]) | set(imported))
    idx_path.write_text(json.dumps(idx, indent=2) + "\n")

if __name__ == "__main__":
    main(sys.argv[1:])
