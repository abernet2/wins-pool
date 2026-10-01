# Backlog

Feature requests and ideas for the wins pool dashboard. Move items to **Done** when shipped.

## Requested

- **ATS (against the spread) stats.** Show how each team, and so each owner, performs against the spread.
  - Odds source (checked 2026-09-30): ESPN's unauthenticated APIs carry DraftKings odds. The scoreboard (`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`) has spread, over/under and moneylines for upcoming games but not finished ones. The core API (`sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/odds`) returned open and close lines for a finished week 1 game, so historic spreads look available. Still to verify: coverage across all games, and how long ESPN keeps them.
  - Spread-based "ATS" needs a final score plus the closing spread per game, both of which we can get from these endpoints.
- **Weekly projections.** See how you and others are slated to perform in the coming week, and how that changes the standings.
  - Needs the upcoming schedule and some win-probability or spread source.
- **Style: refine.** First pass shipped (dense layout, three switchable themes). Iterate from feedback.
- **Mobile friendly.** Make sure every view works well on a phone. The standings and draft tables currently scroll sideways on narrow screens, which is a stopgap.

## Ideas

### Standings readability
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

- Dense side-by-side layout with a switchable theme system (Terminal, Broadcast, Brutalist). Tokens live in `style.css`; `?theme=` in the URL or the header switcher picks one, and the choice is remembered.
- Season view with draft order and standings for both leagues (2026-27).
- Live ESPN feed via a scheduled GitHub Action.
- 💩 / 🔥 weekly callouts: per-week owner wins, latest-week headline, season tallies. Ties share the callout; no callout if every owner won the same number of games; callouts only for finished weeks.
