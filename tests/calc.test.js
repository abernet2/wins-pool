// Run: npm test   (or: node --test)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  computeLeague, computeCallouts, rankHistory, finalizeLeague, buildContext, ownerHistory, teamHistory,
  tally, heatPosition, sumRec, winPct, draftFrequency, draftersOf,
} from "../js/calc.js";

const read = p => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url)));

// ---- a small made-up league: 4 owners, 2 teams each ----
const rec = (w, l, t = 0) => ({ w, l, t });
function league(over = {}) {
  const owners = [["A", .40], ["B", .60], ["C", .50], ["D", .30]].map(([name, hist]) => ({ name, hist }));
  const picks = ["A", "A", "B", "B", "C", "C", "D", "D"].map((owner, i) => ({ pick: i + 1, team: "t" + (i + 1), owner }));
  return { id: 1, name: "League 1", buyIn: 10, relegate: 1, promote: 1, owners, picks, ...over };
}
// A and B both finish on 5 wins; A has a tie, B has the better historic win %.
const TEAMS = { t1: rec(3, 0), t2: rec(2, 0, 1), t3: rec(3, 0), t4: rec(2, 1), t5: rec(2, 1), t6: rec(1, 2), t7: rec(1, 2), t8: rec(0, 3) };

test("standings rank by wins, then historic win %", () => {
  const { rows } = computeLeague(league(), TEAMS);
  assert.deepEqual(rows.map(r => [r.name, r.w, r.rank]), [["B", 5, 1], ["A", 5, 2], ["C", 3, 3], ["D", 1, 4]]);
});

test("promotion/relegation zones break wins ties by most ties first (not by historic win %)", () => {
  const { rows } = computeLeague(league(), TEAMS);
  const zone = n => rows.find(r => r.name === n).zone;
  assert.equal(zone("A"), "promo");   // A: 5 wins and a tie, so ahead of B in the zone ordering...
  assert.equal(zone("B"), undefined); // ...even though B ranks first in the standings
  assert.equal(zone("D"), "rel");
});

test("no promotion or relegation when the league has none", () => {
  const { rows } = computeLeague(league({ promote: 0, relegate: 0 }), TEAMS);
  assert.ok(rows.every(r => r.zone === undefined));
});

test("the pot goes to whoever has the most wins; everyone pays the buy-in", () => {
  const teams = { ...TEAMS, t4: rec(1, 2) };   // B drops to 4 wins, so A leads alone
  const { rows, pot } = computeLeague(league(), teams);
  assert.equal(pot, 40);
  assert.deepEqual(rows.map(r => [r.name, r.net]), [["A", 30], ["B", -10], ["C", -10], ["D", -10]]);
});

test("owners tied on the most wins split the pot, whoever the tiebreak ranks first", () => {
  const { rows } = computeLeague(league(), TEAMS);   // A and B are both on 5 wins
  assert.deepEqual(rows.map(r => [r.name, r.net]), [["B", 10], ["A", 10], ["C", -10], ["D", -10]]);
  const none = computeLeague(league(), Object.fromEntries(Object.keys(TEAMS).map(k => [k, rec(0, 0)])));
  assert.ok(none.rows.every(r => r.net === 0), "before any games everyone is level, so nobody is up or down");
});

test("games and win % include ties", () => {
  const a = computeLeague(league(), TEAMS).rows.find(r => r.name === "A");
  assert.equal(a.g, 6);
  assert.equal(winPct(sumRec([rec(5, 0, 1)])), 5 / 6);
});

// ---- weekly callouts ----
const wk = (complete, results) => ({ complete, results });
test("callouts: most wins get fire, fewest get poop; ties share; level weeks and unfinished weeks get none", () => {
  const weeks = {
    1: wk(true, { t1: "W", t2: "W", t3: "W", t4: "L", t5: "L", t6: "L", t7: "L", t8: "L" }),   // A 2, B 1, C 0, D 0
    2: wk(true, { t1: "W", t2: "L", t3: "W", t4: "L", t5: "W", t6: "L", t7: "W", t8: "L" }),   // everyone 1: no callouts
    3: wk(false, { t1: "W", t2: "W", t3: "L", t4: "L", t5: "L", t6: "L", t7: "L", t8: "L" }),  // not finished
  };
  const co = computeCallouts(league(), weeks);
  assert.deepEqual(co.weeks[1].fire, ["A"]);
  assert.deepEqual(co.weeks[1].poop, ["C", "D"]);
  assert.deepEqual([co.weeks[2].fire, co.weeks[2].poop], [[], []]);
  assert.deepEqual([co.weeks[3].fire, co.weeks[3].poop], [[], []]);
  assert.equal(co.byOwner.A.wins[3], 2);                   // the unfinished week still shows wins so far
  assert.deepEqual([co.byOwner.A.fire, co.byOwner.C.poop, co.byOwner.D.poop], [1, 1, 1]);
});

test("rank history uses finished weeks only and accumulates wins", () => {
  const weeks = {
    1: wk(true, { t1: "W", t2: "W", t3: "L", t4: "L", t5: "L", t6: "L", t7: "L", t8: "L" }),   // A 2
    2: wk(true, { t1: "L", t2: "L", t3: "W", t4: "W", t5: "W", t6: "W", t7: "L", t8: "L" }),   // B 2, C 2
    3: wk(false, { t7: "W", t8: "W" }),
  };
  const rh = rankHistory(league(), weeks);
  assert.deepEqual(Object.keys(rh.A).map(Number), [1, 2]);   // week 3 is not finished
  assert.equal(rh.A[1], 1);                                  // A leads after week 1 (2 wins)
  assert.deepEqual([rh.B[2], rh.C[2], rh.A[2]], [1, 2, 3]);  // after week 2 A, B and C are level on 2; historic win % decides
});

// ---- finishing a season ----
test("finalizeLeague stores rank, net and promotion/relegation, and does not touch its input", () => {
  const lg = league(), before = JSON.stringify(lg);
  const fin = finalizeLeague(lg, TEAMS);
  assert.equal(JSON.stringify(lg), before);
  const o = n => fin.owners.find(x => x.name === n);
  assert.deepEqual([o("B").rank, o("B").net, o("B").move], [1, 10, undefined]);   // B and A split the pot
  assert.deepEqual([o("A").rank, o("A").move], [2, "promoted"]);
  assert.deepEqual([o("D").rank, o("D").net, o("D").move], [4, -10, "relegated"]);
});

function ctxFor(current, pastSeasons) {
  return buildContext({
    idx: { current: "2027-28", seasons: [] }, teamList: [],
    current: { league: { leagues: [league()] }, wins: { teams: TEAMS }, weeks: null },
    past: pastSeasons,
  });
}

test("season rollover: a finished season shows its stored finish in history (regression)", () => {
  // 2026-27 used to be the live season (computed on the fly). Once 2027-28 is current it is read from its stored fields.
  const finished = { league: { leagues: [finalizeLeague(league(), TEAMS)] }, teams: TEAMS };
  const h = ownerHistory(ctxFor(null, { "2026-27": finished }), "D").find(r => r.season === "2026-27");
  assert.deepEqual([h.live, h.rank, h.net, h.move], [false, 4, -10, "relegated"]);

  const unfinalized = { league: { leagues: [league()] }, teams: TEAMS };
  const bad = ownerHistory(ctxFor(null, { "2026-27": unfinalized }), "D").find(r => r.season === "2026-27");
  assert.equal(bad.rank, undefined, "without finalizing, there is nothing stored to read: this is what finalize-season prevents");
});

test("the live season is computed, and its titles/moves are not final", () => {
  const h = ownerHistory(ctxFor(null, {}), "B")[0];
  assert.deepEqual([h.live, h.rank, h.net], [true, 1, 10]);
});

// ---- tallies ----
test("tally groups by key: most often first, then earlier average pick, then alphabetical", () => {
  const e = (key, pick, season) => ({ key, pick, season, rec: rec(10, 7) });
  const t = tally([e("SEA", 5, "2024-25"), e("GB", 3, "2024-25"), e("SEA", 7, "2025-26"), e("BUF", 20, "2025-26"), e("AAA", 20, "2025-26")]);
  assert.deepEqual(t.map(x => x.key), ["SEA", "GB", "AAA", "BUF"]);
  assert.deepEqual([t[0].n, t[0].pickSum / t[0].n, t[0].w, t[0].l, t[0].seasons], [2, 6, 20, 14, ["2024-25", "2025-26"]]);
});

test("heat position runs 0..1 and sits in the middle when everyone is level", () => {
  assert.deepEqual([heatPosition(7, 4, 10), heatPosition(4, 4, 10), heatPosition(10, 4, 10), heatPosition(3, 3, 3)], [.5, 0, 1, .5]);
});

// ---- the real data ----
const seasons = read("seasons.json");

// OPEN QUESTION for the pool (see the README): in 2022-23 League 2 the sheet ranks Joe (31-35-2) above Evans (31-36-1),
// i.e. it broke the tie on wins by MOST TIES first, then historic win %. The live standings here use wins then
// historic win %, which would put Evans first. Every other league-season matches exactly. If the standings rule
// changes to "wins, ties, historic win %", empty this list.
const KNOWN_RANK_DIFFERENCES = ["2022-23 League 2: Joe (sheet #5, computed #6)", "2022-23 League 2: Evans (sheet #6, computed #5)"];

test("computed standings reproduce the final ranks, net money and moves stored from the workbook (2022-23 onward)", () => {
  // Those years have historic win %, so the tiebreak is fully determined; this checks our rules against the sheet's results.
  const rankDiffs = [], other = [];
  let checked = 0;
  for (const sn of seasons.seasons.filter(s => s >= "2022-23" && s !== seasons.current)) {
    const league = read(`${sn}/league.json`), teams = read(`${sn}/wins.json`).teams;
    for (const lg of league.leagues) {
      checked++;
      for (const r of computeLeague(lg, teams).rows) {
        const stored = lg.owners.find(o => o.name === r.name), at = `${sn} ${lg.name}: ${r.name}`;
        if (r.rank !== stored.rank) rankDiffs.push(`${at} (sheet #${stored.rank}, computed #${r.rank})`);
        else {
          if (r.net !== stored.net) other.push(`${at} net ${r.net} vs ${stored.net}`);
          if ((r.zone === "rel" ? "relegated" : r.zone === "promo" ? "promoted" : "") !== (stored.move || "")) other.push(`${at} move`);
        }
      }
    }
  }
  assert.ok(checked >= 8, "expected at least 8 league-seasons, got " + checked);
  assert.deepEqual(other, []);
  assert.deepEqual(rankDiffs.sort(), [...KNOWN_RANK_DIFFERENCES].sort());
});

test("the current season builds, and wins always equal losses within a league (every game has one winner)", () => {
  const cur = seasons.current;
  const ctx = buildContext({
    idx: seasons, teamList: read("teams.json"),
    current: { league: read(`${cur}/league.json`), wins: read(`${cur}/wins.json`), weeks: read(`${cur}/weeks.json`) },
    past: Object.fromEntries(seasons.seasons.filter(s => s !== cur).map(s => [s, { league: read(`${s}/league.json`), teams: read(`${s}/wins.json`).teams }])),
  });
  for (const e of Object.values(ctx.byLeague)) {
    const t = sumRec(e.c.rows);
    assert.equal(t.w, t.l, `${e.lg.name}: ${t.w} wins vs ${t.l} losses`);
  }
  // history works for everyone, and for every team
  for (const lg of ctx.league.leagues) for (const o of lg.owners) assert.ok(ownerHistory(ctx, o.name).length >= 1);
  assert.ok(teamHistory(ctx, "Seattle").length >= 1);
  assert.ok(draftFrequency(ownerHistory(ctx, "Thomas")).length > 0 && draftersOf(teamHistory(ctx, "Seattle")).length > 0);
});
