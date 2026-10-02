"""Rehearses the README's season-rollover checklist on a throwaway copy of the data, with a made-up 2027-28 draft.
Run: python3 -m unittest discover -s tests -v   (needs Node, like the JS tests)"""
import json, pathlib, shutil, subprocess, sys, tempfile, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from validate_data import validate

@unittest.skipUnless(shutil.which("node"), "node is not installed")
class Rollover(unittest.TestCase):
    def test_finalize_switch_import_validate(self):
        d = pathlib.Path(tempfile.mkdtemp()); self.addCleanup(shutil.rmtree, d)
        shutil.copytree(ROOT / "data", d, dirs_exist_ok=True, ignore=shutil.ignore_patterns("sheets"))
        run = lambda *cmd: subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)

        # 1. freeze the finished season
        r = run("node", "scripts/finalize-season.js", "2026-27", "--data-dir", str(d))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(json.loads((d / "2026-27" / "league.json").read_text())["final"])

        # 2. switch the live season
        idx = json.loads((d / "seasons.json").read_text()); idx["current"] = "2027-28"
        (d / "seasons.json").write_text(json.dumps(idx))

        # 3. import the new draft (here: last year's sheet relabelled as 2027-28)
        csv = d / "2027-28.csv"
        csv.write_text((ROOT / "data" / "sheets" / "2026-27.csv").read_text().replace("2026-27", "2027-28"))
        r = run(sys.executable, "scripts/import_season.py", str(csv), "--data-dir", str(d))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        live = json.loads((d / "2027-28" / "league.json").read_text())
        self.assertNotIn("final", live)
        self.assertEqual([(lg["buyIn"], lg["relegate"], lg["promote"]) for lg in live["leagues"]], [(25, 2, 0), (20, 0, 2)])  # carried over

        # 4. validate: the finished season has its ranks, the new one is live, and nothing is inconsistent
        errors, _ = validate(d)
        self.assertEqual(errors, [])

        # 5. skipping step 1 would be caught
        (d / "2026-27" / "league.json").write_text(json.dumps({**json.loads((ROOT / "data" / "2026-27" / "league.json").read_text())}))
        errors, warnings = validate(d)
        self.assertTrue(any("not marked final" in w for w in warnings) and any("rank" in e for e in errors), (errors, warnings))

if __name__ == "__main__":
    unittest.main()
