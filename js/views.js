// Page builders. Each returns an HTML string for the given context (see calc.buildContext) and, where it
// matters, `me` (the owner the visitor picked with "I'm me", or null). No DOM access.
import { esc, pct, money, recStr, shortYear } from "./util.js";
import { heatPosition, findOwner, ownerHistory, teamHistory, draftFrequency, draftersOf, winPct, sumRec } from "./calc.js";

// ---- links and small pieces ----
const ownerLink = n => `<a href="#/player/${encodeURIComponent(n)}">${esc(n)}</a>`;
const teamLink = n => `<a href="#/team/${encodeURIComponent(n)}">${esc(n)}</a>`;
const teamAbbr = (ctx, n) => `<a href="#/team/${encodeURIComponent(n)}" title="${esc(n)}">${ctx.abbr[n] || esc(n)}</a>`;
const notFound = what => `<div class="err">No such ${what}. <a href="#/">Back to the standings</a>.</div>`;

const stat = (label, val) => `<div class="stat"><span>${label}</span><b>${val}</b></div>`;
const potText = (lg, c) => `$${lg.buyIn} × ${lg.owners.length} = $${c.pot} · winner takes all`;
const seasonCell = h => `${esc(h.season)}${h.live ? ` <span class="dim">(live)</span>` : ""}`;
const homeCrumb = ctx => `<a href="#/">Season ${esc(ctx.season)}</a>`;
const rec = (teams, name) => teams[name] || { w: 0, l: 0, t: 0 };

// A fire or poop mark if this owner got the callout that week.
const callMark = (info, name) => info.fire.includes(name) ? " 🔥" : info.poop.includes(name) ? " 💩" : "";

// Position t (1 = best, 0 = worst) as the --up/--dn pair the CSS gradient uses: green -> yellow -> red.
const heatVars = t => `--up:${Math.max(0, (t - .5) * 200).toFixed(0)}%;--dn:${Math.max(0, (.5 - t) * 200).toFixed(0)}%`;

const chip = (r, complete) => r ? `<span class="chip ${r.toLowerCase()}">${r}</span>`
  : `<span class="chip ${complete ? "bye" : "pend"}">${complete ? "–" : "·"}</span>`;
const chipsFor = (ctx, team) => Object.keys(ctx.weeks).map(Number).sort((a, b) => a - b)
  .map(n => chip(ctx.weeks[n].results[team], ctx.weeks[n].complete)).join("");

// "Wk 3  🔥 names  💩 names" for the latest finished week.
function strip(c) {
  const done = c.nums.filter(n => c.weeks[n].complete);
  const last = done[done.length - 1];
  if (!last) return "";
  return `<div class="strip"><b>Wk ${last}</b><span>🔥 ${c.weeks[last].fire.map(ownerLink).join(", ") || "—"}</span>
    <span>💩 ${c.weeks[last].poop.map(ownerLink).join(", ") || "—"}</span></div>`;
}

// ---- tables ----
function standingsTable(c, co, me) {
  const tally = co.nums.length > 0;
  const maxW = Math.max(1, ...c.rows.map(r => r.w)), minW = Math.min(...c.rows.map(r => r.w));
  const body = c.rows.map(r => `<tr class="${r.zone ? "z-" + r.zone : ""}${r.name === me ? " me" : ""}" style="${heatVars(heatPosition(r.w, minW, maxW))}">
    <td class="rank">${r.rank}</td><td class="l owner">${ownerLink(r.name)}</td>
    <td class="w" style="--p:${Math.round(r.w / maxW * 100)}%">${r.w}</td>
    <td>${r.l}</td><td class="c-t">${r.t}</td><td class="dim c-gp">${r.g}</td>
    <td>${pct(r.pct)}</td><td class="dim c-hist">${pct(r.hist)}</td>
    ${tally ? `<td>${co.byOwner[r.name].fire}</td><td>${co.byOwner[r.name].poop}</td>` : ""}
    <td class="${r.net > 0 ? "pos" : "dim"}">${money(r.net)}</td></tr>`).join("");
  return `<table class="st"><thead><tr><th>#</th><th class="l">Owner</th><th>W</th><th>L</th><th class="c-t">T</th><th class="c-gp">GP</th>
    <th>Win%</th><th class="c-hist">Hist%</th>${tally ? "<th>🔥</th><th>💩</th>" : ""}<th>Net</th></tr></thead><tbody>${body}</tbody></table>`;
}

// The record cell is shaded by the team's wins relative to the other teams: a quick read on pick quality.
function draftTable(lg, teams, me) {
  const wins = lg.picks.map(p => rec(teams, p.team).w);
  const max = Math.max(...wins), min = Math.min(...wins);
  const body = lg.picks.map(p => {
    const r = rec(teams, p.team);
    return `<tr class="${p.owner === me ? "me" : ""}"><td class="dim">${p.pick}</td><td class="l">${teamLink(p.team)}</td>
      <td class="l owner">${ownerLink(p.owner)}</td><td class="rec" style="${heatVars(heatPosition(r.w, min, max))}">${recStr(r)}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Pick</th><th class="l">Team</th><th class="l">Owner</th><th>Rec</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function weeklyGrid(c, rows) {
  const th = c.nums.map(n => `<th class="wk${c.weeks[n].complete ? "" : " live"}">${n}</th>`).join("");
  const body = rows.map(r => {
    const cells = c.nums.map(n => {
      const i = c.weeks[n];
      return `<td class="wk${i.complete ? "" : " live"}">${c.byOwner[r.name].wins[n]}${callMark(i, r.name)}</td>`;
    }).join("");
    return `<tr><td class="l owner">${ownerLink(r.name)}</td>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr><th class="l">Wins / wk</th>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

// Shared by "teams an owner drafted" and "owners who drafted a team". keyHtml renders the first cell.
function tallyTable(rows, label, keyHtml, { keyCls = "", timesCls = "" } = {}) {
  const body = rows.map(e => `<tr><td class="l${keyCls}">${keyHtml(e.key)}</td><td${timesCls}><b>${e.n}</b></td>
    <td>${(e.pickSum / e.n).toFixed(1)}</td><td>${recStr(e)}</td>
    <td class="l dim wrap">${e.seasons.slice().sort().map(shortYear).join(" ")}</td></tr>`).join("");
  return `<table><thead><tr><th class="l">${label}</th><th>Times</th><th>Avg pick</th><th>Their record</th><th class="l">Seasons</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function historyTable(ctx, hist) {
  const body = hist.map(h => {
    const mv = h.move === "promoted" ? `<span class="mv up" title="Promoted">▲</span>` : h.move === "relegated" ? `<span class="mv dn" title="Relegated">▼</span>` : "";
    const teams = h.teams.map(t => `${teamAbbr(ctx, t.team)} <span class="dim">${recStr(t.rec)}</span>`).join(" · ");
    return `<tr class="${h.rank === 1 ? "champ" : ""}"><td class="l">${seasonCell(h)}</td>
      <td class="lg">${h.lg}</td><td>${h.rank === 1 ? "🏆 " : ""}#${h.rank}<span class="dim">/${h.of}</span> ${mv}</td>
      <td>${recStr(h)}</td><td>${pct(h.pct)}</td><td class="l wrap tm">${teams}</td></tr>`;
  }).join("");
  return `<table class="hist"><thead><tr><th class="l">Season</th><th>Lg</th><th>Finish</th><th>Record</th><th>Win%</th><th class="l">Teams</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

// ---- pages ----
function dashboard(ctx, me) {
  return `<div class="leagues">` + ctx.league.leagues.map(lg => {
    const { c, co } = ctx.byLeague[lg.id];
    return `<section><h2><a href="#/league/${lg.id}">${esc(lg.name)}</a><a class="more" href="#/league/${lg.id}">draft · weekly ›</a>
      <small><span class="full">${potText(lg, c)}</span><span class="short">$${c.pot} pot</span></small></h2>
      ${strip(co)}
      <div class="tbl">${standingsTable(c, co, me)}</div>
      <details><summary>Draft order</summary><div class="scroll">${draftTable(lg, ctx.teams, me)}</div></details>
      ${co.nums.length ? `<details><summary>Weekly wins</summary><div class="scroll">${weeklyGrid(co, c.rows)}</div></details>` : ""}
    </section>`;
  }).join("") + `</div>
  <div class="legend"><span><i style="color:var(--promo)">▌</i> promotion zone</span><span><i style="color:var(--rel)">▌</i> relegation zone</span><span>🔥 most wins in a week</span><span>💩 fewest</span><span>ties broken by historic win %</span></div>`;
}

function leaguePage(ctx, id, me) {
  const e = ctx.byLeague[id];
  if (!e) return notFound("league");
  const { lg, c, co } = e;
  return `<div class="crumbs">${homeCrumb(ctx)} / ${esc(lg.name)}</div>
    <section class="narrow"><h2>${esc(lg.name)}<small>${potText(lg, c)}</small></h2>
    ${strip(co)}<div class="tbl">${standingsTable(c, co, me)}</div>
    <h3>Wins by week</h3><div class="tbl">${weeklyGrid(co, c.rows)}</div>
    <h3>Draft order</h3><div class="tbl">${draftTable(lg, ctx.teams, me)}</div></section>`;
}

function playerPage(ctx, name, me) {
  const hist = ownerHistory(ctx, name);
  if (!hist.length) return notFound("player");
  const f = findOwner(ctx, name);
  const meBtn = me === name
    ? `<span class="isme">★ This is you</span> <button data-me="">not me</button>`
    : `<button data-me="${esc(name)}">I'm ${esc(name)}</button>`;

  // Career totals across every season in the data. Titles and moves count only once a season is over.
  const career = sumRec(hist);
  const done = hist.filter(h => !h.live);
  const careerStats = [
    stat("Seasons", hist.length), stat("Titles", done.filter(h => h.rank === 1).length),
    stat("Career", recStr(career)), stat("Win %", pct(winPct(career))),
    stat("Promoted", done.filter(h => h.move === "promoted").length), stat("Relegated", done.filter(h => h.move === "relegated").length),
  ].join("");

  let current = `<p class="dim">Not in the ${esc(ctx.season)} pool.</p>`, crumbs = `${homeCrumb(ctx)} / ${esc(name)}`, zone = "";
  if (f) {
    const { lg, row, co, ranks, c } = f;
    zone = row.zone === "rel" ? `<span class="zone rel">relegation zone</span>` : row.zone === "promo" ? `<span class="zone promo">promotion zone</span>` : "";
    crumbs = `${homeCrumb(ctx)} / <a href="#/league/${lg.id}">${esc(lg.name)}</a> / ${esc(name)}`;
    const stats = [
      stat("Rank", `#${row.rank} <small>of ${c.rows.length}</small>`), stat("Record", recStr(row)),
      stat("Win %", pct(row.pct)), stat("Hist %", pct(row.hist)),
      stat("🔥", co.byOwner[name].fire), stat("💩", co.byOwner[name].poop), stat("Net", money(row.net)),
    ].join("");
    const wkCell = (n, text) => `<td class="wk${co.weeks[n].complete ? "" : " live"}">${text}</td>`;
    const rankCells = co.nums.map(n => wkCell(n, ranks[name][n] ? "#" + ranks[name][n] : "·")).join("");
    const winCells = co.nums.map(n => wkCell(n, `${co.byOwner[name].wins[n]}${callMark(co.weeks[n], name)}`)).join("");
    const th = co.nums.map(n => `<th class="wk">${n}</th>`).join("");
    const teamRows = lg.picks.filter(p => p.owner === name).map(p => `<tr><td class="dim">${p.pick}</td><td class="l">${teamAbbr(ctx, p.team)}</td>
        <td>${recStr(rec(ctx.teams, p.team))}</td><td class="l chips">${chipsFor(ctx, p.team)}</td></tr>`).join("");
    current = `<h3>${esc(ctx.season)} · ${esc(lg.name)}</h3><div class="stats">${stats}</div>
      <div class="tbl gap"><table><thead><tr><th class="l"></th>${th}</tr></thead><tbody>
        <tr><td class="l dim">Rank after week</td>${rankCells}</tr>
        <tr><td class="l dim">Wins in week</td>${winCells}</tr></tbody></table></div>
      <div class="tbl gap"><table><thead><tr><th>Pick</th><th class="l">Team</th><th>Rec</th><th class="l">Results</th></tr></thead>
        <tbody>${teamRows}</tbody></table></div>`;
  }

  return `<div class="crumbs">${crumbs}</div>
    <section class="narrow">
      <h2 class="player">${esc(name)} ${zone}<span class="who">${meBtn}</span></h2>
      <div class="stats">${careerStats}</div>
      ${current}
      <h3>Previous seasons</h3><div class="tbl">${historyTable(ctx, hist)}</div>
      <h3>Teams drafted</h3><div class="tbl"><div class="scroll">${tallyTable(draftFrequency(hist), "Team", t => teamAbbr(ctx, t), { timesCls: ' class="num"' })}</div></div>
    </section>`;
}

function teamPage(ctx, name, me) {
  if (!ctx.teams[name]) return notFound("team");
  const hist = teamHistory(ctx, name);
  const done = hist.filter(h => !h.live);   // best and worst only count finished seasons
  const total = sumRec(hist);
  const best = done.length ? done.reduce((a, b) => b.pct > a.pct || (b.pct === a.pct && b.w > a.w) ? b : a) : null;
  const worst = done.length ? done.reduce((a, b) => b.pct < a.pct || (b.pct === a.pct && b.w < a.w) ? b : a) : null;
  const stats = [
    stat("Seasons", hist.length), stat("Record", recStr(total)), stat("Win %", pct(total.w / (total.w + total.l + total.t || 1))),
    best ? stat("Best", `${recStr(best)} <small>${shortYear(best.season)}</small>`) : "",
    worst ? stat("Worst", `${recStr(worst)} <small>${shortYear(worst.season)}</small>`) : "",
  ].join("");

  const cell = d => d ? `<span class="${d.owner === me ? "isme" : ""}">${ownerLink(d.owner)}</span> <span class="dim">#${d.pick}</span>` : `<span class="dim">–</span>`;
  const maxLg = Math.max(...Object.values(ctx.all).flatMap(S => S.league.leagues.map(l => l.id)));
  const lgIds = Array.from({ length: maxLg }, (_, i) => i + 1);
  const rows = hist.map(h => `<tr><td class="l">${seasonCell(h)}</td>
    <td>${recStr(h)}</td><td>${pct(h.pct)}</td>
    ${lgIds.map(id => `<td class="l lgc${h.drafted[id] ? "" : " none"}" data-lg="${id}">${cell(h.drafted[id])}</td>`).join("")}</tr>`).join("");

  const wkChips = Object.keys(ctx.weeks).length
    ? `<h3>${esc(ctx.season)} by week</h3><div class="chips big">${chipsFor(ctx, name)}</div>` : "";
  return `<div class="crumbs">${homeCrumb(ctx)} / ${esc(name)}</div>
    <section class="narrow"><h2>${esc(name)}</h2>
      <div class="stats">${stats}</div>${wkChips}
      <h3>By season</h3>
      <div class="tbl"><table class="hist"><thead><tr><th class="l">Season</th><th>Record</th><th>Win%</th>
        ${lgIds.map(id => `<th class="l">League ${id} owner</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
      <h3>Drafted by</h3>
      <div class="tbl"><div class="scroll">${tallyTable(draftersOf(hist), "Owner", ownerLink, { keyCls: " owner" })}</div></div>
    </section>`;
}

/** The HTML for a location hash like "#/player/Mike%20B". */
export function route(hash, ctx, me) {
  const [, kind, arg] = (hash || "#/").split("/");
  let val = arg || null;
  try { if (arg) val = decodeURIComponent(arg); } catch (e) { /* malformed %-escape: use it as typed, it just won't match anything */ }
  return !kind ? dashboard(ctx, me)
    : kind === "player" ? playerPage(ctx, val, me)
    : kind === "team" ? teamPage(ctx, val, me)
    : kind === "league" ? leaguePage(ctx, val, me)
    : notFound("page");
}
