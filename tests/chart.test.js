import test from "node:test";
import assert from "node:assert/strict";
import { standingsChart } from "../js/chart.js";
import { standingsSeries, rankHistory } from "../js/calc.js";

const owners = ["A", "B", "C", "D", "E", "F", "G", "H"].map((name, i) => ({ name, hist: .5 - i / 100 }));
// each owner has one team t1..t8; owner i wins in weeks where i is below the cutoff, so gaps grow over time
const league = { id: 1, name: "League 1", buyIn: 10, relegate: 0, promote: 0, owners, picks: owners.map((o, i) => ({ pick: i + 1, team: "t" + (i + 1), owner: o.name })) };
const week = (complete, wins) => ({ complete, results: Object.fromEntries(owners.map((o, i) => ["t" + (i + 1), wins.includes(i) ? "W" : "L"])) });
const weeks = { 1: week(true, [0, 1, 2, 3]), 2: week(true, [0, 1, 2]), 3: week(true, [0, 1]), 4: week(false, [0]) };
const build = opts => { const s = standingsSeries(league, weeks); return standingsChart(league, s, rankHistory(league, weeks), opts); };

test("waits for two finished weeks before drawing", () => {
  const one = standingsSeries(league, { 1: weeks[1] });
  assert.match(standingsChart(league, one, rankHistory(league, { 1: weeks[1] })), /appears once two weeks are finished/);
});

test("draws one line, one tap target and one label per owner, from finished weeks only", () => {
  const html = build();
  assert.equal((html.match(/class="ch-line/g) || []).length, 8);
  assert.equal((html.match(/class="ch-hit"/g) || []).length, 8);
  assert.equal((html.match(/class="ch-lbl/g) || []).length, 8);
  assert.equal((html.match(/points="/g) || []).length, 16);
  assert.ok(html.includes(">3</text>") && !html.includes(">4</text>"), "x axis stops at the last FINISHED week (3), not the unfinished week 4");
});

test("the visitor's own line is drawn heavier and last (on top)", () => {
  const html = build({ me: "C" });
  assert.ok(html.indexOf('class="ch-line me"') > html.indexOf('data-owner="H"'));
  assert.equal((html.match(/ch-line me/g) || []).length, 1);
});

test("labels never overlap, even when owners are level", () => {
  for (const compact of [false, true]) {
    const ys = [...build({ compact }).matchAll(/class="ch-lbl[^"]*"[^>]* y="([\d.]+)"/g)].map(m => Number(m[1])).sort((a, b) => a - b);
    assert.equal(ys.length, 8);
    ys.slice(1).forEach((y, i) => assert.ok(y - ys[i] >= 10.99, `labels ${i} and ${i + 1} are ${y - ys[i]}px apart`));
  }
});

test("a line carries what the tap readout needs: gap, rank and week", () => {
  const html = build();
  assert.match(html, /data-owner="H" data-gap="-3" data-rank="8" data-week="3"/);   // A and B win every finished week (3 wins); H never wins, so 3 behind and last
});

test("names are escaped", () => {
  const evil = { ...league, owners: [{ name: 'A"<b>', hist: .5 }, ...owners.slice(1)], picks: league.picks.map(p => p.owner === "A" ? { ...p, owner: 'A"<b>' } : p) };
  const s = standingsSeries(evil, weeks);
  const html = standingsChart(evil, s, rankHistory(evil, weeks));
  assert.ok(!html.includes('<b>') && html.includes("&lt;b&gt;"));
});
