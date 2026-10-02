// Small formatting helpers shared by the views.
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
export const money = n => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(0);
export const recStr = r => `${r.w}-${r.l}${r.t ? "-" + r.t : ""}`;   // 11-6, or 9-7-1 with a tie
export const shortYear = s => "'" + s.slice(2, 4);                    // "2025-26" -> "'25"
