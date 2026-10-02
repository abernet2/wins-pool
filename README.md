# NFL Wins Pool

A static dashboard for our NFL wins pool: two leagues of 8 owners, each owner drafts 4 teams, and you score a point for every win. Most wins in a league takes the pot. The bottom of League 1 and the top of League 2 swap places each year.

Live: https://abernet2.github.io/wins-pool/ (GitHub Pages, served straight from `main`; there is no build step).

## Run it locally

```
python3 scripts/serve.py        # http://localhost:8000, caching off so edits show up
node --test              # JS tests (needs Node 22+)
python3 -m unittest discover -s tests   # Python tests
python3 scripts/validate_data.py        # consistency check of everything under data/
```

On `localhost`, or with `?debug` in the URL, the page shows a build stamp (when the files last changed and the viewport size).

## How it fits together

```
index.html, style.css      page shell and all styling (three themes, phone layout)
js/calc.js                 ALL the logic: standings, tiebreaks, callouts, history. No DOM, so Node can run it too.
js/views.js                builds the HTML for each page from a context object
js/chart.js                the "wins behind the leader" SVG chart (league pages); colors come from --s1..--s8 per theme
js/app.js                  startup, routing (#/player/Name, #/team/Name, #/league/1), "I'm me", theme picker
js/util.js                 small formatting helpers
data/seasons.json          which seasons exist and which one is "current" (live)
data/teams.json            the 32 teams: name, display abbreviation, ESPN abbreviation (one list for page and scripts)
data/<season>/league.json  owners, picks (the draft), league rules (buy-in, promotion/relegation counts)
data/<season>/wins.json    each team's record. For the live season this is overwritten by the update job.
data/<season>/weeks.json   each team's result per week (live season only)
scripts/                   fetch_wins.py (ESPN), import_season.py, finalize-season.js, validate_data.py, serve.py
tests/                     JS (node:test) and Python (unittest) tests
.github/workflows/         update-wins.yml (live data), test.yml (tests on every push)
```

The page loads the JSON, `calc.js` computes everything, `views.js` renders it. Finished seasons store their results in `league.json` (`rank`, `net`, `move`, `final: true`); the live season computes them on the fly.

## Live updates

`update-wins.yml` runs on GitHub's scheduler (Thu-Tue, every 30 minutes, plus a midweek check), fetches records and weekly results from ESPN's public scoreboard/standings endpoints (no API key), runs `validate_data.py`, commits `data/` if anything changed, and asks Pages to rebuild. Notes:

- **It is slower than the schedule says.** GitHub throttles scheduled runs on quiet repos; expect a few runs a day, not every 30 minutes. For a prompt update after a game: `gh workflow run update-wins.yml` (or Actions tab > Update wins > Run workflow).
- **ESPN's endpoints are unofficial** and could change. The script rejects a response for the wrong season and treats "no games listed" as not finished. If a run fails, nothing is published.
- **Off-season:** the script does nothing outside the regular season (from ESPN's own dates). Each run also re-enables the workflow, which is meant to stop GitHub's 60-day inactivity shutdown of scheduled workflows. *That is untested; check in September that the schedule is still running (Actions tab, or `gh workflow list`).*
- The job pushes to `main`. If you push at the same moment it rebases and retries, but `git pull` before you push your own work.

## The rules as implemented (`js/calc.js`)

- A player's wins are the sum of their 4 teams' regular-season wins. Ties count for nothing. No playoffs.
- **Standings rank:** most wins, then historic win % (an owner's all-time win %, kept in `league.json`).
- **Promotion/relegation:** League 1's bottom `relegate` owners and League 2's top `promote` owners (2 each). Their tiebreak is wins, then most ties, then historic win %.
- **Money:** everyone pays the buy-in; the pot goes to the owner(s) with the most wins, split equally if tied (this is how the sheet has paid out, e.g. 2023-24 League 1).
- **Standings chart:** after each *finished* week, how many wins each owner is behind that week's leader (the leader is 0). Tap a line or name to focus it.
- 🔥 / 💩: each finished week, the owner(s) with the most / fewest wins in their league. Ties share it; nobody gets one if everyone is level.

**Open question:** in 2022-23 League 2 the sheet ranked Joe (31-35-2) above Evans (31-36-1), i.e. it broke the tie on wins by most ties before historic win %. The live standings use wins then historic win %, which would rank Evans first. Every other league-season matches the sheet exactly. If the pool wants ties first, change the `rows.sort` line in `computeLeague` and empty `KNOWN_RANK_DIFFERENCES` in `tests/calc.test.js`.

## Season rollover (do this each year)

1. **After the last game, freeze the finished season.** `node scripts/finalize-season.js --dry-run`, check it, then run it without `--dry-run`. Without this, the finished season would have no stored rank or money once the next one starts.
2. **Switch the live season.** Edit `data/seasons.json`: set `"current"` to the new season (e.g. `"2027-28"`). The update job and the page follow it.
3. **Load the new draft.** Export the new season's tab from the Google Sheet as CSV and run `python3 scripts/import_season.py "NFL Wins Pool - 2027-28 Season.csv"`. It keeps the draft and each owner's historic win % (typed into the sheet) and carries over the league rules from last season. It refuses to overwrite a live season that already has results unless you pass `--force`.
4. Run `python3 scripts/validate_data.py`, commit, push. Until ESPN publishes the new season the update job quietly does nothing.
5. Past seasons can be re-imported from the full workbook: `python3 scripts/import_season.py "NFL Wins Pool.xlsx"` (needs `pip install openpyxl`). Keep the `.xlsx` out of the repo (it has everyone's winnings; `.gitignore` already excludes it).

## Adding a theme

Add a `[data-theme="name"]` block of CSS variables to `style.css` (see the existing three) and one entry to the `THEMES` list at the top of `index.html`.

## More

Ideas and requests live in [BACKLOG.md](BACKLOG.md).
