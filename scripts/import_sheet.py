#!/usr/bin/env python3
"""Convert a season's Google Sheets CSV export into data/league.json + data/wins.json.

Usage: scripts/import_sheet.py data/sheets/2026-27.csv
Draft picks and owner historic win % are read from the sheet; team records
seed wins.json (the live feed will overwrite those later).
"""
import csv, json, sys, pathlib

src = pathlib.Path(sys.argv[1])
rows = list(csv.reader(src.open(newline="")))
pct = lambda s: round(float(s.strip("%")) / 100, 4)

season = rows[1][0]
picks = {1: [], 2: []}
records = {}
for r in rows[1:]:
    if r[0] != season or not r[1].isdigit():
        continue
    lg, pick, team, owner = int(r[1]), int(r[2]), r[3], r[4]
    w, l, t = int(r[5]), int(r[6]), int(r[7])
    picks[lg].append({"pick": pick, "team": team, "owner": owner})
    records[team] = {"w": w, "l": l, "t": t}

# Right-hand block: owner rows start where col 11 is a league number
owners = {1: [], 2: []}
for r in rows[1:]:
    if len(r) > 19 and r[11] in ("1", "2"):
        cur = int(r[11])
    elif len(r) > 19 and r[11] == "League":
        continue
    if len(r) > 19 and r[12] and r[13].isdigit() and r[19].endswith("%"):
        owners[cur].append({"name": r[12], "draftSlot": int(r[13]), "hist": pct(r[19])})

league = {
    "season": season,
    "leagues": [
        {"id": 1, "name": "League 1", "buyIn": 25, "relegate": 2, "promote": 0,
         "owners": owners[1], "picks": picks[1]},
        {"id": 2, "name": "League 2", "buyIn": 20, "relegate": 0, "promote": 2,
         "owners": owners[2], "picks": picks[2]},
    ],
}
out = pathlib.Path(__file__).resolve().parent.parent / "data"
(out / "league.json").write_text(json.dumps(league, indent=2) + "\n")
(out / "wins.json").write_text(json.dumps({"season": season, "teams": records}, indent=2) + "\n")
print(f"{season}: {sum(len(v) for v in picks.values())} picks, {len(records)} teams, "
      f"{len(owners[1])}+{len(owners[2])} owners")
