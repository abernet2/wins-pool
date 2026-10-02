import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeSeason } from "../scripts/finalize-season.js";

const realData = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

function tempData() {                       // a throwaway copy of the live season
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wins-pool-"));
  fs.mkdirSync(path.join(dir, "2026-27"));
  for (const f of ["league.json", "wins.json"]) fs.copyFileSync(path.join(realData, "2026-27", f), path.join(dir, "2026-27", f));
  return dir;
}

test("finalizeSeason freezes rank, net and moves, and marks the season final", () => {
  const dir = tempData();
  const out = finalizeSeason(dir, "2026-27");
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "2026-27", "league.json")));
  assert.equal(saved.final, true);
  for (const lg of saved.leagues) {
    assert.deepEqual(lg.owners.map(o => o.rank).sort((a, b) => a - b), lg.owners.map((_, i) => i + 1), "ranks run 1..n");
    assert.ok(lg.owners.every(o => typeof o.net === "number"));
    assert.equal(lg.owners.filter(o => o.move === "relegated").length, lg.relegate);
    assert.equal(lg.owners.filter(o => o.move === "promoted").length, lg.promote);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(out)), saved);
});

test("finalizeSeason will not redo a finished season unless forced, and a dry run writes nothing", () => {
  const dir = tempData();
  const before = fs.readFileSync(path.join(dir, "2026-27", "league.json"), "utf8");
  finalizeSeason(dir, "2026-27", { dryRun: true });
  assert.equal(fs.readFileSync(path.join(dir, "2026-27", "league.json"), "utf8"), before);
  finalizeSeason(dir, "2026-27");
  assert.throws(() => finalizeSeason(dir, "2026-27"), /already finalized/);
  assert.doesNotThrow(() => finalizeSeason(dir, "2026-27", { force: true }));
});
