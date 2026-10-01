// NFL Wins Pool: static, hash-routed. Data lives in data/<season>/; everything else is computed here.
const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
const money = n => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(0);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ownerLink = n => `<a href="#/player/${encodeURIComponent(n)}">${esc(n)}</a>`;
const teamLink = n => `<a href="#/team/${encodeURIComponent(n)}">${esc(n)}</a>`;
const $ = id => document.getElementById(id);

// ---- "I'm me" (saved in this browser only) ----
const getMe = () => { try { return localStorage.getItem("me"); } catch (e) { return null; } };
const setMe = n => { try { n ? localStorage.setItem("me", n) : localStorage.removeItem("me"); } catch (e) {} };

// ---- themes ----
function initThemes() {
  const el = $("themes");
  const render = () => { el.innerHTML = THEMES.map(([k, n]) =>
    `<button data-t="${k}" aria-pressed="${document.documentElement.dataset.theme === k}">${n}</button>`).join(""); };
  el.addEventListener("click", e => {
    const t = e.target.dataset && e.target.dataset.t;
    if (!t) return;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("theme", t); } catch (err) {}
    render();
  });
  render();
}

// ---- data ----
const getJSON = u => fetch(u, { cache: "no-store" }).then(r => r.ok ? r.json() : null);
let CTX;
async function loadSeason() {
  const idx = await getJSON("data/seasons.json");
  const season = idx.current;
  const [league, wins, weeks] = await Promise.all(["league", "wins", "weeks"].map(f => getJSON(`data/${season}/${f}.json`)));
  const ctx = { idx, season, league, wins, teams: wins.teams, weeks: weeks ? weeks.weeks : {} };
  ctx.byLeague = {};
  league.leagues.forEach(lg => {
    const c = computeLeague(lg, ctx.teams);
    ctx.byLeague[lg.id] = { lg, c, co: computeCallouts(lg, ctx.weeks), ranks: rankHistory(lg, ctx.weeks) };
  });
  return ctx;
}

// ---- calculations ----
function computeLeague(lg, teams) {
  const picksByOwner = {};
  lg.picks.forEach(p => (picksByOwner[p.owner] ||= []).push(p));
  const rows = lg.owners.map(o => {
    const mine = picksByOwner[o.name] || [];
    const s = { w: 0, l: 0, t: 0 };
    mine.forEach(p => { const r = teams[p.team] || { w: 0, l: 0, t: 0 }; s.w += r.w; s.l += r.l; s.t += r.t; });
    const g = s.w + s.l + s.t;
    return { ...o, ...s, g, pct: g ? s.w / g : 0 };
  });
  // Standings: most wins, then historic win %.
  rows.sort((a, b) => b.w - a.w || b.hist - a.hist);
  rows.forEach((r, i) => r.rank = i + 1);
  // Promotion/relegation tiebreakers: wins, then most ties, then historic win %.
  const pr = [...rows].sort((a, b) => b.w - a.w || b.t - a.t || b.hist - a.hist);
  pr.slice(0, lg.promote).forEach(r => r.zone = "promo");
  if (lg.relegate) pr.slice(-lg.relegate).forEach(r => r.zone = "rel");
  // Winner takes the pot.
  const pot = lg.buyIn * rows.length;
  rows.forEach(r => r.net = (r.rank === 1 ? pot : 0) - lg.buyIn);
  return { rows, pot };
}

// Weekly callouts: owner(s) with the most wins in a finished week get 🔥, fewest get 💩.
// Ties share it; nobody is called out if every owner won the same number of games.
function computeCallouts(lg, weeks) {
  const teamsByOwner = {};
  lg.picks.forEach(p => (teamsByOwner[p.owner] ||= []).push(p.team));
  const nums = Object.keys(weeks).map(Number).sort((a, b) => a - b);
  const out = { nums, byOwner: {}, weeks: {} };
  lg.owners.forEach(o => out.byOwner[o.name] = { fire: 0, poop: 0, wins: {} });
  nums.forEach(n => {
    const wk = weeks[n];
    const wins = {};
    lg.owners.forEach(o => {
      wins[o.name] = teamsByOwner[o.name].filter(t => wk.results[t] === "W").length;
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

// Rank after each finished week (cumulative wins, ties by historic win %): { owner: { weekNumber: rank } }
function rankHistory(lg, weeks) {
  const teamsByOwner = {};
  lg.picks.forEach(p => (teamsByOwner[p.owner] ||= []).push(p.team));
  const nums = Object.keys(weeks).map(Number).sort((a, b) => a - b).filter(n => weeks[n].complete);
  const total = Object.fromEntries(lg.owners.map(o => [o.name, 0]));
  const out = Object.fromEntries(lg.owners.map(o => [o.name, {}]));
  nums.forEach(n => {
    lg.owners.forEach(o => total[o.name] += teamsByOwner[o.name].filter(t => weeks[n].results[t] === "W").length);
    [...lg.owners].sort((a, b) => total[b.name] - total[a.name] || b.hist - a.hist)
      .forEach((o, i) => out[o.name][n] = i + 1);
  });
  return out;
}

// ---- shared pieces ----
const chip = (r, complete) => r ? `<span class="chip ${r.toLowerCase()}">${r}</span>`
  : `<span class="chip ${complete ? "bye" : "pend"}">${complete ? "–" : "·"}</span>`;

function chipsFor(ctx, team) {
  return Object.keys(ctx.weeks).map(Number).sort((a, b) => a - b)
    .map(n => chip(ctx.weeks[n].results[team], ctx.weeks[n].complete)).join("");
}

function strip(c) {
  const done = c.nums.filter(n => c.weeks[n].complete);
  const last = done[done.length - 1];
  if (!last) return "";
  return `<div class="strip"><b>Wk ${last}</b><span>🔥 ${c.weeks[last].fire.map(ownerLink).join(", ") || "—"}</span>
    <span>💩 ${c.weeks[last].poop.map(ownerLink).join(", ") || "—"}</span></div>`;
}

function standingsTable(c, co, me) {
  const tally = co.nums.length > 0;
  const maxW = Math.max(1, ...c.rows.map(r => r.w)), minW = Math.min(...c.rows.map(r => r.w));
  // Position by wins: 1 = most, 0 = fewest; ties share a color. Split into up/down halves for the CSS gradient.
  const heat = r => { const t = maxW === minW ? .5 : (r.w - minW) / (maxW - minW);
    return `--up:${Math.max(0, (t - .5) * 200).toFixed(0)}%;--dn:${Math.max(0, (.5 - t) * 200).toFixed(0)}%`; };
  const body = c.rows.map(r => `<tr class="${r.zone ? "z-" + r.zone : ""}${r.name === me ? " me" : ""}" style="${heat(r)}">
    <td class="rank">${r.rank}</td><td class="l owner">${ownerLink(r.name)}</td>
    <td class="w" style="--p:${Math.round(r.w / maxW * 100)}%">${r.w}</td>
    <td>${r.l}</td><td>${r.t}</td><td class="dim">${r.g}</td>
    <td>${pct(r.pct)}</td><td class="dim">${pct(r.hist)}</td>
    ${tally ? `<td>${co.byOwner[r.name].fire}</td><td>${co.byOwner[r.name].poop}</td>` : ""}
    <td class="${r.net > 0 ? "pos" : "dim"}">${money(r.net)}</td></tr>`).join("");
  return `<table class="st"><thead><tr><th>#</th><th class="l">Owner</th><th>W</th><th>L</th><th>T</th><th>GP</th>
    <th>Win%</th><th>Hist%</th>${tally ? "<th>🔥</th><th>💩</th>" : ""}<th>Net</th></tr></thead><tbody>${body}</tbody></table>`;
}

function draftTable(lg, teams, me) {
  const body = lg.picks.map(p => {
    const r = teams[p.team] || { w: 0, l: 0, t: 0 };
    return `<tr class="${p.owner === me ? "me" : ""}"><td class="dim">${p.pick}</td><td class="l">${teamLink(p.team)}</td>
      <td class="l owner">${ownerLink(p.owner)}</td><td>${r.w}-${r.l}${r.t ? "-" + r.t : ""}</td></tr>`;
  }).join("");
  return `<table><thead><tr><th>Pick</th><th class="l">Team</th><th class="l">Owner</th><th>Rec</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function weeklyGrid(c, rows) {
  const th = c.nums.map(n => `<th class="wk${c.weeks[n].complete ? "" : " live"}">${n}</th>`).join("");
  const body = rows.map(r => {
    const o = c.byOwner[r.name];
    const cells = c.nums.map(n => {
      const i = c.weeks[n];
      const mark = i.fire.includes(r.name) ? " 🔥" : i.poop.includes(r.name) ? " 💩" : "";
      return `<td class="wk${i.complete ? "" : " live"}">${o.wins[n]}${mark}</td>`;
    }).join("");
    return `<tr><td class="l owner">${ownerLink(r.name)}</td>${cells}</tr>`;
  }).join("");
  return `<table><thead><tr><th class="l">Wins / wk</th>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---- views ----
function dashboard(ctx) {
  const me = getMe();
  return `<div class="leagues">` + ctx.league.leagues.map(lg => {
    const { c, co } = ctx.byLeague[lg.id];
    return `<section><h2><a href="#/league/${lg.id}">${esc(lg.name)}</a><small>$${lg.buyIn} × ${lg.owners.length} = $${c.pot} · winner takes all</small></h2>
      ${strip(co)}
      <div class="tbl">${standingsTable(c, co, me)}</div>
      <details><summary>Draft order</summary><div class="scroll">${draftTable(lg, ctx.teams, me)}</div></details>
      ${co.nums.length ? `<details><summary>Weekly wins</summary><div class="scroll">${weeklyGrid(co, c.rows)}</div></details>` : ""}
    </section>`;
  }).join("") + `</div>
  <div class="legend"><i style="color:var(--promo)">▌</i> promotion zone &nbsp; <i style="color:var(--rel)">▌</i> relegation zone &nbsp; · &nbsp; 🔥 most wins in a week &nbsp; 💩 fewest &nbsp; · &nbsp; ties broken by historic win %</div>`;
}

function leaguePage(ctx, id) {
  const e = ctx.byLeague[id];
  if (!e) return notFound("league");
  const me = getMe(), { lg, c, co } = e;
  return `<div class="crumbs"><a href="#/">Season ${esc(ctx.season)}</a> / ${esc(lg.name)}</div>
    <section class="narrow"><h2>${esc(lg.name)}<small>$${lg.buyIn} × ${lg.owners.length} = $${c.pot} · winner takes all</small></h2>
    ${strip(co)}<div class="tbl">${standingsTable(c, co, me)}</div>
    <h3>Wins by week</h3><div class="tbl">${weeklyGrid(co, c.rows)}</div>
    <h3>Draft order</h3><div class="tbl">${draftTable(lg, ctx.teams, me)}</div></section>`;
}

function findOwner(ctx, name) {
  for (const lg of ctx.league.leagues) {
    const row = ctx.byLeague[lg.id].c.rows.find(r => r.name === name);
    if (row) return { lg, row, ...ctx.byLeague[lg.id] };
  }
  return null;
}

function playerPage(ctx, name) {
  const f = findOwner(ctx, name);
  if (!f) return notFound("player");
  const { lg, row, co, ranks, c } = f;
  const me = getMe();
  const mine = lg.picks.filter(p => p.owner === name);
  const wkNums = co.nums;
  const meBtn = me === name
    ? `<span class="isme">★ This is you</span> <button data-me="">not me</button>`
    : `<button data-me="${esc(name)}">I'm ${esc(name)}</button>`;

  const stat = (label, val) => `<div class="stat"><span>${label}</span><b>${val}</b></div>`;
  const stats = [
    stat("Rank", `#${row.rank} <small>of ${c.rows.length}</small>`),
    stat("Record", `${row.w}-${row.l}${row.t ? "-" + row.t : ""}`),
    stat("Win %", pct(row.pct)),
    stat("Hist %", pct(row.hist)),
    stat("🔥", co.byOwner[name].fire), stat("💩", co.byOwner[name].poop),
    stat("Net", money(row.net)),
  ].join("");

  // Rank and wins by week
  const rankCells = wkNums.map(n => `<td class="wk${co.weeks[n].complete ? "" : " live"}">${ranks[name][n] ? "#" + ranks[name][n] : "·"}</td>`).join("");
  const winCells = wkNums.map(n => {
    const i = co.weeks[n], w = co.byOwner[name].wins[n];
    const mark = i.fire.includes(name) ? " 🔥" : i.poop.includes(name) ? " 💩" : "";
    return `<td class="wk${i.complete ? "" : " live"}">${w}${mark}</td>`;
  }).join("");
  const th = wkNums.map(n => `<th class="wk">${n}</th>`).join("");

  const teamRows = mine.map(p => {
    const r = ctx.teams[p.team] || { w: 0, l: 0, t: 0 };
    return `<tr><td class="dim">${p.pick}</td><td class="l">${teamLink(p.team)}</td>
      <td>${r.w}-${r.l}${r.t ? "-" + r.t : ""}</td><td class="l chips">${chipsFor(ctx, p.team)}</td></tr>`;
  }).join("");

  const zone = row.zone === "rel" ? `<span class="zone rel">relegation zone</span>` : row.zone === "promo" ? `<span class="zone promo">promotion zone</span>` : "";
  return `<div class="crumbs"><a href="#/">Season ${esc(ctx.season)}</a> / <a href="#/league/${lg.id}">${esc(lg.name)}</a> / ${esc(name)}</div>
    <section class="narrow">
      <h2 class="player">${esc(name)} ${zone}<span class="who">${meBtn}</span></h2>
      <div class="stats">${stats}</div>
      <h3>${esc(ctx.season)} · ${esc(lg.name)}</h3>
      <div class="tbl"><table><thead><tr><th class="l"></th>${th}</tr></thead><tbody>
        <tr><td class="l dim">Rank after week</td>${rankCells}</tr>
        <tr><td class="l dim">Wins in week</td>${winCells}</tr></tbody></table></div>
      <h3>Teams</h3>
      <div class="tbl"><table><thead><tr><th>Pick</th><th class="l">Team</th><th>Rec</th><th class="l">Results</th></tr></thead>
        <tbody>${teamRows}</tbody></table></div>
    </section>`;
}

function teamPage(ctx, name) {
  if (!ctx.teams[name]) return notFound("team");
  const r = ctx.teams[name];
  const drafted = ctx.league.leagues.map(lg => {
    const p = lg.picks.find(x => x.team === name);
    return p ? `<tr><td class="l">${esc(lg.name)}</td><td class="dim">${p.pick}</td><td class="l owner">${ownerLink(p.owner)}</td></tr>` : "";
  }).join("");
  const wk = Object.keys(ctx.weeks).map(Number).sort((a, b) => a - b).map(n => `<tr>
    <td class="dim">Wk ${n}</td><td class="l">${chip(ctx.weeks[n].results[name], ctx.weeks[n].complete)}</td></tr>`).join("");
  return `<div class="crumbs"><a href="#/">Season ${esc(ctx.season)}</a> / ${esc(name)}</div>
    <section class="narrow"><h2>${esc(name)}<small>${ctx.season} · ${r.w}-${r.l}${r.t ? "-" + r.t : ""}</small></h2>
      <div class="chips big">${chipsFor(ctx, name)}</div>
      <h3>Drafted by</h3>
      <div class="tbl"><table><thead><tr><th class="l">League</th><th>Pick</th><th class="l">Owner</th></tr></thead><tbody>${drafted}</tbody></table></div>
    </section>`;
}

const notFound = what => `<div class="err">No such ${what}. <a href="#/">Back to the standings</a>.</div>`;

// ---- router ----
function render() {
  const [, kind, arg] = (location.hash || "#/").split("/");
  const val = arg ? decodeURIComponent(arg) : null;
  const view = !kind ? dashboard(CTX)
    : kind === "player" ? playerPage(CTX, val)
    : kind === "team" ? teamPage(CTX, val)
    : kind === "league" ? leaguePage(CTX, val)
    : notFound("page");
  $("app").innerHTML = view;
  renderMe();
  window.scrollTo(0, 0);
}

function renderMe() {
  const me = getMe();
  $("me").innerHTML = me ? `<a href="#/player/${encodeURIComponent(me)}" class="meLink">★ ${esc(me)}</a>` : "";
}

document.addEventListener("click", e => {
  if (!e.target.dataset || e.target.dataset.me === undefined) return;
  setMe(e.target.dataset.me || null);
  render();
});
window.addEventListener("hashchange", render);

initThemes();
loadSeason().then(ctx => {
  CTX = ctx;
  const upd = ctx.wins.updated ? ` · updated ${new Date(ctx.wins.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "";
  $("sub").textContent = `${ctx.season} · regular season${upd}`;
  render();
}).catch(e => {
  $("sub").textContent = "";
  $("app").innerHTML = `<div class="err">Could not load data (${esc(e.message)}). Serve this folder over http, e.g. <code>python3 -m http.server</code>.</div>`;
});
