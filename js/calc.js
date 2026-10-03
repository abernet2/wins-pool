// All of the pool's logic, with no DOM access, so it runs in the browser and in Node (tests, scripts).
//
// Vocabulary: a *league* has owners and picks (owner <-> team). Teams have W/L/T records. Weekly results are
// { "<week>": { complete, results: { team: "W"|"L"|"T" } } }. A *context* (see buildContext) bundles every
// season's data plus the current season's computed standings.

// ---- records ----
export const blank = () => ({ w: 0, l: 0, t: 0 });
export const sumRec = recs => recs.reduce((a, r) => ({ w: a.w + r.w, l: a.l + r.l, t: a.t + r.t }), blank());
export const games = r => r.w + r.l + r.t;
export const winPct = r => (games(r) ? r.w / games(r) : 0);

/** { owner: [value, ...] } for a league's picks (the pick itself, or pick -> value). */
export function byOwner(lg, pick = p => p) {
  const m = {};
  lg.picks.forEach(p => (m[p.owner] ||= []).push(pick(p)));
  return m;
}

const weekWins = (teams, wk) => teams.filter(t => wk.results[t] === "W").length;
const weekNumbers = weeks => Object.keys(weeks).map(Number).sort((a, b) => a - b);

/** Position of v between min and max: 1 = best, 0 = worst, .5 when everyone is level. Drives the heat colors. */
export const heatPosition = (v, min, max) => (max === min ? .5 : (v - min) / (max - min));

// ---- current standings ----
/**
 * Standings for one league. Rank is most wins, then historic win %. Promotion/relegation zones use a different
 * tiebreak (wins, then most ties, then historic win %). Net money: the pot goes to the owner(s) with the most wins,
 * split equally when tied.
 */
export function computeLeague(lg, teams) {
  const picks = byOwner(lg);
  const rows = lg.owners.map(o => {
    const s = sumRec((picks[o.name] || []).map(p => teams[p.team] || blank()));
    return { ...o, ...s, g: games(s), pct: winPct(s) };
  });
  rows.sort((a, b) => b.w - a.w || b.hist - a.hist);
  rows.forEach((r, i) => r.rank = i + 1);
  const pr = [...rows].sort((a, b) => b.w - a.w || b.t - a.t || b.hist - a.hist);
  pr.slice(0, lg.promote).forEach(r => r.zone = "promo");
  if (lg.relegate) pr.slice(-lg.relegate).forEach(r => r.zone = "rel");
  // Winner takes the pot; owners tied on the most wins split it (as the sheet has paid out, e.g. 2018-19, 2023-24).
  const pot = lg.buyIn * rows.length;
  const leaders = rows.filter(r => r.w === rows[0].w);
  rows.forEach(r => r.net = (r.w === rows[0].w ? pot / leaders.length : 0) - lg.buyIn);
  return { rows, pot };
}

/**
 * Weekly callouts: the owner(s) with the most wins in a finished week get a fire, the fewest get poop. Ties share it,
 * and nobody is called out if every owner won the same number of games. Unfinished weeks are never called out.
 */
export function computeCallouts(lg, weeks) {
  const teams = byOwner(lg, p => p.team);
  const nums = weekNumbers(weeks);
  const out = { nums, byOwner: {}, weeks: {} };
  lg.owners.forEach(o => out.byOwner[o.name] = { fire: 0, poop: 0, wins: {} });
  nums.forEach(n => {
    const wk = weeks[n], wins = {};
    lg.owners.forEach(o => {
      wins[o.name] = weekWins(teams[o.name], wk);
      out.byOwner[o.name].wins[n] = wins[o.name];
    });
    const vals = Object.values(wins), max = Math.max(...vals), min = Math.min(...vals);
    const info = { complete: wk.complete, fire: [], poop: [] };
    if (wk.complete && max !== min) {
      lg.owners.forEach(o => {
        if (wins[o.name] === max) { info.fire.push(o.name); out.byOwner[o.name].fire++; }
        if (wins[o.name] === min) { info.poop.push(o.name); out.byOwner[o.name].poop++; }
      });
    }
    out.weeks[n] = info;
  });
  return out;
}

/**
 * Each owner's cumulative wins after every FINISHED week, and how far behind the week's leader they were:
 * { weeks: [1, 2, ...], wins: {owner: [...]}, lead: [...], behind: {owner: [...]} }  (behind is 0 for the leader, else negative).
 */
export function standingsSeries(lg, weeks) {
  const teams = byOwner(lg, p => p.team);
  const nums = weekNumbers(weeks).filter(n => weeks[n].complete);
  const total = Object.fromEntries(lg.owners.map(o => [o.name, 0]));
  const wins = Object.fromEntries(lg.owners.map(o => [o.name, []]));
  const lead = [];
  nums.forEach(n => {
    lg.owners.forEach(o => { total[o.name] += weekWins(teams[o.name], weeks[n]); wins[o.name].push(total[o.name]); });
    lead.push(Math.max(...Object.values(total)));
  });
  const behind = Object.fromEntries(lg.owners.map(o => [o.name, wins[o.name].map((w, i) => w - lead[i])]));
  return { weeks: nums, wins, lead, behind };
}

/** Rank after each finished week (cumulative wins, ties by historic win %): { owner: { week: rank } }. */
export function rankHistory(lg, weeks) {
  const s = standingsSeries(lg, weeks);
  const out = Object.fromEntries(lg.owners.map(o => [o.name, {}]));
  s.weeks.forEach((n, i) => [...lg.owners].sort((a, b) => s.wins[b.name][i] - s.wins[a.name][i] || b.hist - a.hist)
    .forEach((o, r) => out[o.name][n] = r + 1));
  return out;
}

/**
 * Freeze a finished season: store each owner's rank, net money and promotion/relegation in the league data, so
 * that season no longer depends on being computed live. (Past seasons imported from the workbook already have these.)
 */
export function finalizeLeague(lg, teams) {
  const rows = Object.fromEntries(computeLeague(lg, teams).rows.map(r => [r.name, r]));
  return {
    ...lg,
    owners: lg.owners.map(o => {
      const r = rows[o.name], out = { ...o, rank: r.rank, net: r.net };
      if (r.zone === "rel") out.move = "relegated"; else if (r.zone === "promo") out.move = "promoted";
      return out;
    }),
  };
}

// ---- the context every page reads from ----
/**
 * @param idx       data/seasons.json
 * @param teamList  data/teams.json
 * @param current   { league, wins, weeks, games } for the current season (weeks and games may be null)
 * @param past      { "<season>": { league, teams } } for every other season
 */
export function buildContext({ idx, teamList, current, past }) {
  const { league, wins, weeks, games } = current;
  const ctx = {
    idx, season: idx.current, league, wins, teams: wins.teams, weeks: weeks ? weeks.weeks : {},
    abbr: Object.fromEntries(teamList.map(t => [t.name, t.abbr])),
    all: { ...past, [idx.current]: { league, teams: wins.teams } },
    games: games ? games.games : [],
    byLeague: {},
  };
  league.leagues.forEach(lg => {
    ctx.byLeague[lg.id] = { lg, c: computeLeague(lg, ctx.teams), co: computeCallouts(lg, ctx.weeks), ranks: rankHistory(lg, ctx.weeks), series: standingsSeries(lg, ctx.weeks),
      luck: ownerLuck(lg, ctx.games) };
  });
  return ctx;
}

/** The current-season league an owner is in: { lg, row, c, co, ranks }, or null. */
export function findOwner(ctx, name) {
  for (const lg of ctx.league.leagues) {
    const row = ctx.byLeague[lg.id].c.rows.find(r => r.name === name);
    if (row) return { lg, row, ...ctx.byLeague[lg.id] };
  }
  return null;
}

// ---- history across seasons ----
/** Every season an owner played, newest first: league, finish, record, and their teams. */
export function ownerHistory(ctx, name) {
  const rows = [];
  Object.keys(ctx.all).sort().reverse().forEach(season => {
    const S = ctx.all[season], live = season === ctx.season;
    S.league.leagues.forEach(lg => {
      const o = lg.owners.find(x => x.name === name);
      if (!o) return;
      const teams = lg.picks.filter(p => p.owner === name)
        .map(p => ({ team: p.team, pick: p.pick, rec: S.teams[p.team] || blank() }));
      const rec = sumRec(teams.map(t => t.rec));
      // The live season is computed; finished seasons carry rank / net / move in their league data.
      const row = live ? ctx.byLeague[lg.id].c.rows.find(r => r.name === name) : null;
      rows.push({
        season, live, lg: lg.id, of: lg.owners.length, teams, ...rec, pct: winPct(rec),
        rank: row ? row.rank : o.rank, net: row ? row.net : o.net,
        move: row ? (row.zone === "rel" ? "relegated" : row.zone === "promo" ? "promoted" : "") : (o.move || ""),
      });
    });
  });
  return rows;
}

/** Every season a team has been in the pool, newest first: final record and who drafted it in each league. */
export function teamHistory(ctx, name) {
  return Object.keys(ctx.all).sort().reverse().map(season => {
    const S = ctx.all[season], rec = S.teams[name];
    if (!rec) return null;
    const drafted = {};
    S.league.leagues.forEach(lg => {
      const p = lg.picks.find(x => x.team === name);
      if (p) drafted[lg.id] = { owner: p.owner, pick: p.pick };
    });
    return { season, live: season === ctx.season, ...rec, pct: winPct(rec), drafted };
  }).filter(Boolean);
}

/**
 * Group entries { key, pick, rec, season } by key: how many times, average pick, combined record, seasons.
 * Most frequent first, then the earlier average pick, then alphabetical.
 */
export function tally(entries) {
  const m = {};
  entries.forEach(({ key, pick, rec, season }) => {
    const e = m[key] ||= { key, n: 0, pickSum: 0, w: 0, l: 0, t: 0, seasons: [] };
    e.n++; e.pickSum += pick; e.w += rec.w; e.l += rec.l; e.t += rec.t; e.seasons.push(season);
  });
  return Object.values(m).sort((a, b) => b.n - a.n || a.pickSum / a.n - b.pickSum / b.n || a.key.localeCompare(b.key));
}

/** Teams an owner has drafted, from ownerHistory rows. */
export const draftFrequency = hist =>
  tally(hist.flatMap(h => h.teams.map(t => ({ key: t.team, pick: t.pick, rec: t.rec, season: h.season }))));

/** Owners who have drafted a team, from teamHistory rows. */
export const draftersOf = hist =>
  tally(hist.flatMap(h => Object.values(h.drafted).map(d => ({ key: d.owner, pick: d.pick, rec: h, season: h.season }))));

// ---- betting lines (data/<season>/games.json) ----
// A game: { week, home, away, spread (points the HOME team is favored by; negative = away favored; null = no line),
//           total, homeMl, awayMl, homeScore, awayScore (null until final) }.

const impliedProb = ml => (ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));   // moneyline -> probability, bookmaker's margin included
const normCdf = z => {                                                      // standard normal CDF (Abramowitz & Stegun 7.1.26)
  const t = 1 / (1 + .3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? .5 * (1 + erf) : .5 * (1 - erf);
};
const NFL_MARGIN_SD = 13.5;   // typical standard deviation of an NFL game's final margin, in points

/** Chance the home team wins: from the moneylines with the bookmaker's margin removed, else from the spread, else null. */
export function homeWinProb(g) {
  if (g.homeMl != null && g.awayMl != null) {
    const h = impliedProb(g.homeMl), a = impliedProb(g.awayMl);
    return h / (h + a);
  }
  return g.spread != null ? normCdf(g.spread / NFL_MARGIN_SD) : null;
}

/** Against the spread, from the home side's view: 1 home covered, -1 away covered, 0 push, null if not final or no line. */
export function coverResult(g) {
  if (g.spread == null || g.homeScore == null || g.awayScore == null) return null;
  return Math.sign(g.homeScore - g.awayScore - g.spread);
}

/** One team's games from its own point of view (spread < 0 means the team was favored). */
export function teamGames(games, team) {
  return games.filter(g => g.home === team || g.away === team).map(g => {
    const home = g.home === team, ph = homeWinProb(g), cover = coverResult(g);
    const final = g.homeScore != null && g.awayScore != null, margin = final ? (home ? 1 : -1) * (g.homeScore - g.awayScore) : null;
    return {
      week: g.week, opp: home ? g.away : g.home, home, spread: g.spread == null ? null : (home ? -g.spread : g.spread),
      p: ph == null ? null : (home ? ph : 1 - ph), final, won: final ? margin > 0 : null, tie: final && margin === 0,
      cover: cover == null ? null : ((home ? cover : -cover) > 0 ? "W" : (home ? cover : -cover) < 0 ? "L" : "P"),
    };
  }).sort((a, b) => a.week - b.week);
}

/**
 * Wins versus what the lines expected, and the record against the spread, over a set of team-games. Only finished
 * games with a win probability count, so "wins" and "expected" always cover the same games.
 */
export function lineSummary(rows) {
  const out = { games: 0, wins: 0, exp: 0, ats: { w: 0, l: 0, p: 0 } };
  rows.forEach(r => {
    if (r.final && r.p != null) { out.games++; out.exp += r.p; if (r.won) out.wins++; }
    if (r.cover) out.ats[r.cover.toLowerCase()]++;
  });
  return { ...out, diff: out.wins - out.exp };
}

/** Per owner in a league: wins vs expected wins and ATS across their teams, luckiest first. Null when there is no data. */
export function ownerLuck(lg, games) {
  if (!games || !games.length) return null;
  const teams = byOwner(lg, p => p.team);
  const rows = lg.owners.map(o => {
    const sum = lineSummary(teams[o.name].flatMap(t => teamGames(games, t)));
    const decided = sum.ats.w + sum.ats.l;
    return { name: o.name, ...sum, atsPct: decided ? sum.ats.w / decided : null };
  });
  if (!rows.some(r => r.games)) return null;
  return rows.sort((a, b) => b.diff - a.diff || a.name.localeCompare(b.name));
}
