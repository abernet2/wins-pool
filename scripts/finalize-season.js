#!/usr/bin/env node
// Freeze a finished season. While a season is live the page computes everyone's rank, net money and
// promotion/relegation on the fly; once it is over those are written into data/<season>/league.json, so the
// history pages no longer depend on the live calculation. (Past seasons imported from the workbook already have them.)
//
//   node scripts/finalize-season.js [season] [--dry-run] [--force] [--data-dir DIR]
//
// Run it after the last game, BEFORE switching "current" in data/seasons.json to the next season.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeLeague, computeLeague } from "../js/calc.js";

const readJSON = p => JSON.parse(fs.readFileSync(p, "utf8"));
const here = path.dirname(fileURLToPath(import.meta.url));

export function finalizeSeason(dataDir, season, { dryRun = false, force = false } = {}) {
  const dir = path.join(dataDir, season);
  const league = readJSON(path.join(dir, "league.json"));
  const teams = readJSON(path.join(dir, "wins.json")).teams;
  if (league.final && !force) throw new Error(`${season} is already finalized (use --force to redo it)`);
  const out = { ...league, final: true, leagues: league.leagues.map(lg => finalizeLeague(lg, teams)) };
  if (!dryRun) fs.writeFileSync(path.join(dir, "league.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = f => args.includes(f);
  const di = args.indexOf("--data-dir");
  const dataDir = di >= 0 ? path.resolve(args[di + 1]) : path.join(here, "..", "data");
  const season = args.find((a, i) => !a.startsWith("--") && i !== di + 1) || readJSON(path.join(dataDir, "seasons.json")).current;
  try {
    const teams = readJSON(path.join(dataDir, season, "wins.json")).teams;
    const out = finalizeSeason(dataDir, season, { dryRun: flag("--dry-run"), force: flag("--force") });
    for (const lg of out.leagues) {
      console.log(`\n${season} ${lg.name}`);
      const rows = computeLeague(lg, teams).rows;
      for (const o of [...lg.owners].sort((a, b) => a.rank - b.rank)) {
        const r = rows.find(x => x.name === o.name);
        console.log(`  #${o.rank}  ${o.name.padEnd(10)} ${String(r.w).padStart(2)}-${String(r.l).padEnd(2)} ${String(o.net).padStart(7)}  ${o.move || ""}`);
      }
    }
    console.log(flag("--dry-run") ? "\n(dry run: nothing written)" : `\nWrote data/${season}/league.json (final: true)`);
  } catch (e) { console.error("error:", e.message); process.exit(1); }
}
