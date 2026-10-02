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

/** Rank after each finished week (cumulative wins, ties by historic win %): { owner: { week: rank } }. */
export function rankHistory(lg, weeks) {
  const teams = byOwner(lg, p => p.team);
  const nums = weekNumbers(weeks).filter(n => weeks[n].complete);
  const total = Object.fromEntries(lg.owners.map(o => [o.name, 0]));
  const out = Object.fromEntries(lg.owners.map(o => [o.name, {}]));
  nums.forEach(n => {
    lg.owners.forEach(o => total[o.name] += weekWins(teams[o.name], weeks[n]));
    [...lg.owners].sort((a, b) => total[b.name] - total[a.name] || b.hist - a.hist)
      .forEach((o, i) => out[o.name][n] = i + 1);
  });
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
 * @param current   { league, wins, weeks } for the current season (weeks may be null)
 * @param past      { "<season>": { league, teams } } for every other season
 */
export function buildContext({ idx, teamList, current, past }) {
  const { league, wins, weeks } = current;
  const ctx = {
    idx, season: idx.current, league, wins, teams: wins.teams, weeks: weeks ? weeks.weeks : {},
    abbr: Object.fromEntries(teamList.map(t => [t.name, t.abbr])),
    all: { ...past, [idx.current]: { league, teams: wins.teams } },
    byLeague: {},
  };
  league.leagues.forEach(lg => {
    ctx.byLeague[lg.id] = { lg, c: computeLeague(lg, ctx.teams), co: computeCallouts(lg, ctx.weeks), ranks: rankHistory(lg, ctx.weeks) };
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
