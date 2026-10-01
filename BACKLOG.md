# Backlog

Feature requests and ideas for the wins pool dashboard. Move items to **Done** when shipped.

## Requested

- **ATS (against the spread) stats.** Show how each team, and so each owner, performs against the spread.
  - Odds source (checked 2026-09-30): ESPN's unauthenticated APIs carry DraftKings odds. The scoreboard (`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`) has spread, over/under and moneylines for upcoming games but not finished ones. The core API (`sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/odds`) returned open and close lines for a finished week 1 game, so historic spreads look available. Still to verify: coverage across all games, and how long ESPN keeps them.
  - Spread-based "ATS" needs a final score plus the closing spread per game, both of which we can get from these endpoints.
- **Resource pages (read-only).** A hash-routed page per resource, so every view is linkable: season `#/2026-27`, league `#/2026-27/league/1`, player `#/player/Jack`, team `#/team/Buffalo`. Names in tables become links.
  - Needs per-season data folders (`data/<season>/league.json|wins.json|weeks.json`) and a `data/seasons.json` index; the importer and fetch script take a season argument.
  - Player page: seasons played, league and finish per season, 🔥/💩 totals, money, best and worst picks. Team page: wins per season and who drafted it.
  - Past seasons need backfilling from the old sheets (not yet provided).
- **Hall of Fame / Shame.** Across all seasons: highest and lowest season win %, most and fewest wins, most titles and relegations, most 🔥/💩, best and worst weeks (4-0 or 0-4), best and worst picks, longest streaks.
- **"Log in" as a person.** Choose a name once (saved in the browser, no auth). Highlights your row everywhere and opens your player page by default. Depends on resource pages.
- **Weekly projections.** See how you and others are slated to perform in the coming week, and how that changes the standings.
  - Needs the upcoming schedule and some win-probability or spread source.
- **Style: refine.** First pass shipped (dense layout, three switchable themes). Iterate from feedback.
- **Mobile friendly.** Make sure every view works well on a phone. The standings and draft tables currently scroll sideways on narrow screens, which is a stopgap.

## Ideas

### Standings readability
- Rank bump chart: positions by week across the season (falls out of the weekly data).
- "This week" panel: games grouped by owner, with owner-vs-owner matchups when two owners hold both sides.
- Copy-to-clipboard weekly summary (standings plus 🔥/💩) for the group chat.
- Trash-talk stats: luckiest owner (wins vs. spread expectations), most costly team, streaks.
- Draft-pick grading per season.
- Clinch and elimination badges.
- Expandable owner rows showing each of their 4 teams and its record.
- Movement arrows showing rank change since last week.
- A dividing line above the promotion and relegation spots, plus a "safe by N wins" gap to the cutoff.

### Context
- Wins-over-time chart per owner.
- Games remaining per team, and each owner's maximum possible wins.
- Clinch and elimination markers once the math allows.
- Head-to-head owner comparison.

### Pool history
- Season switcher and a champions history list, loaded from `data/sheets/`.
- Compute historic win % from past seasons instead of entering it by hand.
- Money tracker, once the sheet's "Raw" and "Adj" net $ columns are understood, plus all-time winnings.
- Team logos and colors from ESPN.

### Smarter
- Projected final win totals from each team's pace.
- Notifications when an owner enters the relegation zone or takes the lead.
- Per-owner shareable URLs, like `#/owner/Jack`.

## Done

- Per-season data folders (`data/<season>/`), hash router, first-pass player, team and league pages, and an "I'm me" button on player pages (saved in the browser; highlights your row and adds a ★ link in the header).
- Dense side-by-side layout with a switchable theme system (Terminal, Broadcast, Brutalist). Tokens live in `style.css`; `?theme=` in the URL or the header switcher picks one, and the choice is remembered.
- Season view with draft order and standings for both leagues (2026-27).
- Live ESPN feed via a scheduled GitHub Action.
- 💩 / 🔥 weekly callouts: per-week owner wins, latest-week headline, season tallies. Ties share the callout; no callout if every owner won the same number of games; callouts only for finished weeks.
