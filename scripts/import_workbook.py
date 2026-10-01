#!/usr/bin/env python3
"""Import past seasons from the pool's Excel workbook into data/<season>/.

Usage: scripts/import_workbook.py "NFL Wins Pool.xlsx" [season ...]

Needs openpyxl (dev-time only; the site and the Action don't): pip install openpyxl.
Reads every "<season> Season" tab. The left block (cols A-J) has the picks and each
team's final record; the right block has per-owner results (rank, net $, promoted or
relegated), which varies a little between years, so its columns are found by header
name. Skips the current season in data/seasons.json (that one is live) unless it is
named explicitly. Registers the seasons in data/seasons.json.
"""
import json, pathlib, sys
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
INT = lambda v: int(v) if v not in (None, "") else 0

def parse_tab(ws, season):
    rows = list(ws.iter_rows(values_only=True))
    picks = {}   # league -> [pick, ...]
    records = {}
    for r in rows[1:]:
        if r[0] == season and isinstance(r[1], (int, float)):
            lg = int(r[1])
            picks.setdefault(lg, []).append({"pick": INT(r[2]), "team": r[3], "owner": r[4]})
            records[r[3]] = {"w": INT(r[5]), "l": INT(r[6]), "t": INT(r[7])}

    # Right block: find columns by header name (first header row, cols K onwards).
    hdr = {str(v).strip(): i for i, v in enumerate(rows[0]) if v is not None and i >= 10}
    col = lambda *names: next((hdr[n] for n in names if n in hdr), None)
    c_owner, c_slot = col("Owner"), col("Pick")
    c_w, c_l, c_t = col("Wins"), col("Losses"), col("Ties")
    c_hist, c_rank = col("Hist. %"), col("Rank", "Win Rk")
    c_net, c_tag, c_lg = col("Net $ (Raw)"), col("Pro / Rel?"), col("League")

    owners = {}
    cur = 1
    for r in rows[1:]:
        if c_lg is not None and isinstance(r[c_lg], (int, float)):
            cur = int(r[c_lg])
        name = r[c_owner]
        if not name or name in ("Owner", "TOTAL", "AVG") or not isinstance(r[c_slot], (int, float)):
            continue
        o = {"name": name, "draftSlot": INT(r[c_slot]),
             "rank": INT(r[c_rank]), "net": round(float(r[c_net] or 0), 2)}
        if c_hist is not None and isinstance(r[c_hist], (int, float)):
            o["hist"] = round(float(r[c_hist]), 4)
        tag = (r[c_tag] or "").strip().lower() if c_tag is not None else ""
        if tag in ("relegated", "promoted"):
            o["move"] = tag
        o["_w"], o["_l"], o["_t"] = INT(r[c_w]), INT(r[c_l]), INT(r[c_t])
        owners.setdefault(cur, []).append(o)
    return picks, records, owners

def main():
    path = pathlib.Path(sys.argv[1])
    only = set(sys.argv[2:])
    idx_path = DATA / "seasons.json"
    idx = json.loads(idx_path.read_text())
    wb = openpyxl.load_workbook(path, data_only=True)
    imported = []
    for ws in wb.worksheets:
        if not ws.title.endswith(" Season"):
            continue
        season = ws.title.split()[0]
        if (only and season not in only) or (not only and season == idx["current"]):
            continue
        picks, records, owners = parse_tab(ws, season)
        leagues = []
        for lg in sorted(picks):
            owns = owners[lg]
            # Sanity check: each owner's sheet totals must equal the sum of their picks' records.
            for o in owns:
                mine = [p["team"] for p in picks[lg] if p["owner"] == o["name"]]
                got = tuple(sum(records[t][k] for t in mine) for k in "wlt")
                if len(mine) != 4 or got != (o["_w"], o["_l"], o["_t"]):
                    print(f"  warning {season} L{lg} {o['name']}: picks {len(mine)} sum {got} vs sheet {(o['_w'], o['_l'], o['_t'])}")
                for k in ("_w", "_l", "_t"):
                    del o[k]
            nets = [o["net"] for o in owns]
            leagues.append({
                "id": lg, "name": f"League {lg}", "buyIn": round(-min(nets), 2),
                "relegate": sum(o.get("move") == "relegated" for o in owns),
                "promote": sum(o.get("move") == "promoted" for o in owns),
                "owners": sorted(owns, key=lambda o: o["draftSlot"]), "picks": picks[lg]})
        out = DATA / season
        out.mkdir(exist_ok=True)
        (out / "league.json").write_text(json.dumps({"season": season, "final": True, "leagues": leagues}, indent=2) + "\n")
        (out / "wins.json").write_text(json.dumps({"season": season, "teams": dict(sorted(records.items()))}, indent=2) + "\n")
        imported.append(season)
        print(f"{season}: {len(leagues)} league(s), {sum(len(l['owners']) for l in leagues)} owners")
    idx["seasons"] = sorted(set(idx["seasons"]) | set(imported))
    idx_path.write_text(json.dumps(idx, indent=2) + "\n")

if __name__ == "__main__":
    main()
