// NFL Wins Pool: a static, hash-routed page. Data lives in data/; the logic is in calc.js, the pages in views.js.
import { esc } from "./util.js";
import { buildContext } from "./calc.js";
import { route } from "./views.js";

const $ = id => document.getElementById(id);
const THEMES = window.THEMES;   // declared in index.html's inline script so the theme applies before first paint

// Debug extras (build stamp) show only on a local server, or anywhere with ?debug in the URL.
const DEBUG = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || /[?&]debug\b/.test(location.search);

// ---- "I'm me" (saved in this browser only) ----
const getMe = () => { try { return localStorage.getItem("me"); } catch (e) { return null; } };
const setMe = n => { try { n ? localStorage.setItem("me", n) : localStorage.removeItem("me"); } catch (e) {} };

// ---- themes ----
function initThemes() {
  const el = $("themes");
  el.innerHTML = `<select aria-label="Theme">${THEMES.map(([k, n]) =>
    `<option value="${k}"${document.documentElement.dataset.theme === k ? " selected" : ""}>${n}</option>`).join("")}</select>`;
  el.firstChild.addEventListener("change", e => {
    document.documentElement.dataset.theme = e.target.value;
    try { localStorage.setItem("theme", e.target.value); } catch (err) {}
  });
}

// ---- data ----
// The live season changes through the day, so it is always re-fetched; finished seasons never change.
const getJSON = (u, fresh) => fetch(u, { cache: fresh ? "no-store" : "default" }).then(r => r.ok ? r.json() : null);

async function load() {
  const idx = await getJSON("data/seasons.json", true);
  const [teamList, league, wins, weeks] = await Promise.all([
    getJSON("data/teams.json"), ...["league", "wins", "weeks"].map(f => getJSON(`data/${idx.current}/${f}.json`, true))]);
  const past = {};
  await Promise.all(idx.seasons.filter(s => s !== idx.current).map(async sn => {
    const [lg, w] = await Promise.all([getJSON(`data/${sn}/league.json`), getJSON(`data/${sn}/wins.json`)]);
    if (lg && w) past[sn] = { league: lg, teams: w.teams };
  }));
  return buildContext({ idx, teamList, current: { league, wins, weeks }, past });
}

// ---- routing ----
let CTX;
function render() {
  const me = getMe();
  $("app").innerHTML = route(location.hash, CTX, me);
  $("me").innerHTML = me ? `<a href="#/player/${encodeURIComponent(me)}" class="meLink">★ ${esc(me)}</a>` : "";
  window.scrollTo(0, 0);
}

document.addEventListener("click", e => {
  if (!e.target.dataset || e.target.dataset.me === undefined) return;
  setMe(e.target.dataset.me || null);
  render();
});
window.addEventListener("hashchange", render);

// ---- debug stamp: which files are running, and what the browser is actually applying ----
function stampBuild() {
  const layout = () => {
    const query = matchMedia("(max-width: 600px)").matches;                                       // does the page count as phone-sized?
    const rules = getComputedStyle(document.documentElement).getPropertyValue("--phone").trim() === "1";   // did the phone CSS arrive?
    return query ? (rules ? "phone layout" : '<b class="stale">phone-sized but the phone CSS is missing: stale style.css</b>') : "desktop layout (viewport over 600px)";
  };
  const vp = () => `${innerWidth}×${innerHeight} @${devicePixelRatio}x` + (visualViewport && Math.abs(visualViewport.scale - 1) > .01 ? ` zoom ${visualViewport.scale.toFixed(2)}` : "");
  const show = lm => { if (!$("build")) return;
    $("build").innerHTML = (lm ? " · build " + esc(new Date(lm).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) : "") + ` · ${vp()} · ${layout()}`; };
  fetch("js/app.js", { method: "HEAD", cache: "no-store" }).then(r => show(r.headers.get("last-modified"))).catch(() => show(null));
  window.addEventListener("resize", () => show(null));
}

initThemes();
load().then(ctx => {
  CTX = ctx;
  const upd = ctx.wins.updated ? ` · updated ${new Date(ctx.wins.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "";
  $("sub").innerHTML = `${esc(ctx.season)} · regular season${esc(upd)}${DEBUG ? '<span id="build"></span>' : ""}`;
  render();
  if (DEBUG) stampBuild();
}).catch(e => {
  $("sub").textContent = "";
  $("app").innerHTML = `<div class="err">Could not load data (${esc(e.message)}). Serve this folder over http, e.g. <code>python3 scripts/serve.py</code>.</div>`;
});
