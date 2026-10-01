# Backlog

Feature requests and ideas for the wins pool dashboard. Move items to **Done** when shipped.

## Requested

- **💩 / 🔥 weekly callouts.** Each week, the owner with the most wins gets 🔥 and the owner with the fewest gets 💩. Keep a running tally of who has collected the most of each across the season.
  - Open: is "most wins" wins *gained that week* or total wins? (Assumed: gained that week.)
  - Open: how to handle weekly ties, and whether callouts are per league or across both.
  - Needs weekly snapshots of team records (the Action's history of `data/wins.json` commits, or an explicit `data/history/` file).
- **ATS (against the spread) stats.** Show how each team, and so each owner, performs against the spread.
  - Needs a source for spreads and results. Check whether ESPN's odds data covers it before committing to this.
- **Weekly projections.** See how you and others are slated to perform in the coming week, and how that changes the standings.
  - Needs the upcoming schedule and some win-probability or spread source.
- **Style changes.** The current look is deliberately basic. To be discussed in more depth before any work.
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

- Season view with draft order and standings for both leagues (2026-27).
- Live ESPN feed via a scheduled GitHub Action.
