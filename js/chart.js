// The "wins behind the leader" chart: one line per owner, weeks across, the week's leader at 0 and everyone else
// below. Drawn as inline SVG (no library); colors come from the theme's --s1..--s8 variables. Returns an HTML string.
import { esc } from "./util.js";

const PALETTE = 8;                                    // --s1 .. --s8 in style.css
const STEPS = [1, 2, 4, 5, 10, 20];                   // y-axis gridline spacing, smallest that gives <= ~5 lines

/**
 * @param lg      the league (owners in draft order, which fixes each owner's color)
 * @param series  calc.standingsSeries(lg, weeks)
 * @param ranks   calc.rankHistory(lg, weeks)  (shown when a line is focused)
 * @param me      the visitor's owner, drawn heavier (or null)
 * @param compact narrower layout for phones
 */
export function standingsChart(lg, series, ranks, { me = null, compact = false } = {}) {
  const n = series.weeks.length;
  if (n < 2) return `<p class="dim">The chart appears once two weeks are finished.</p>`;

  const W = compact ? 360 : 760, H = compact ? 300 : 330;
  const L = compact ? 28 : 40, R = compact ? 74 : 94, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const lowest = Math.min(...Object.values(series.behind).flat());
  const step = STEPS.find(s => -lowest / s <= 5) || STEPS.at(-1);
  const ymin = -Math.max(1, Math.ceil(-lowest / step)) * step;
  const x = i => L + i / (n - 1) * pw;
  const y = v => T + (v / ymin) * ph;                 // 0 at the top edge, ymin at the bottom

  let grid = "";
  for (let v = 0; v >= ymin; v -= step)
    grid += `<line class="${v === 0 ? "ch-zero" : "ch-grid"}" x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}"/>`
      + `<text class="ch-ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  series.weeks.forEach((w, i) => {
    if (n <= 9 || i % 2 === 0 || i === n - 1) grid += `<text class="ch-ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${w}</text>`;
  });

  const owners = lg.owners.map((o, idx) => ({ name: o.name, color: `var(--s${idx % PALETTE + 1})`, v: series.behind[o.name] }));
  const last = series.weeks[n - 1];
  const attrs = o => `data-owner="${esc(o.name)}" data-gap="${o.v[n - 1]}" data-rank="${ranks[o.name][last]}" data-week="${last}"`;
  // Lines (the visitor's last, so it sits on top), each with a wide invisible copy that is easy to tap.
  const ordered = [...owners.filter(o => o.name !== me), ...owners.filter(o => o.name === me)];
  const pts = o => o.v.map((a, i) => `${x(i).toFixed(1)},${y(a).toFixed(1)}`).join(" ");
  const lines = ordered.map(o => `<polyline class="ch-line${o.name === me ? " me" : ""}" ${attrs(o)} style="stroke:${o.color}" points="${pts(o)}"/>`
    + `<polyline class="ch-hit" ${attrs(o)} points="${pts(o)}"/>`).join("");

  // Names at the right end of each line, nudged apart so they don't overlap.
  const gap = compact ? 11 : 12;
  const labels = owners.map(o => ({ o, y: y(o.v[n - 1]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;
  const names = labels.map(l => `<text class="ch-lbl${l.o.name === me ? " me" : ""}" ${attrs(l.o)} x="${L + pw + 8}" y="${l.y + 4}" style="fill:${l.o.color}">${esc(l.o.name)}</text>`).join("");

  return `<div class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wins behind the leader after each finished week, one line per owner">${grid}${lines}${names}</svg>
    <div class="ch-readout" aria-live="polite">Wins behind the leader after each finished week. Tap a line or a name to focus it.</div>
  </div>`;
}
