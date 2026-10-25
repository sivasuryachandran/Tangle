"""checker/run.py: assemble report.json from a render output directory
(scene.json, assumed_screen.json, anchors.json, t_<ms>/L.png + R.png) and a
TRUE screen spec, per CLAUDE.md Section 6 step 10 and Section 3.6. Also
writes certificate.json alongside it when overall == PASS.

The TRUE screen comes from --true, not from true_screen.json inside --dir:
at demo time (CLAUDE.md Section 9 step 3), the judge changes the live
geometry and the *existing* render is checked against the *new* true
spec, without re-rendering. --dir's own true_screen.json (what was true
when it was rendered) is left untouched for provenance.

CLI: python -m checker.run --dir runs/<id>/v<N> --true T.json --thresholds config/thresholds.json --out report.json

--skip NAME [NAME...] marks named hard checks NOT RUN instead of
computing them, e.g. --skip C1 for a fast repair-loop round with no
rendered images yet (C1 needs t_<ms>/<panel>.png on disk; C2/C3/C5 need
only scene.json + screen specs + anchors.json, and C4 already falls
back to its analytic surface-sample proxy when no mask_ref.png exists,
so nothing else needs skipping for a render-free round). A skipped
check always makes overall FAIL and suppresses the certificate -- NOT
RUN is never treated as passing, so a fast round can never be mistaken
for a certified result. Only a full run (no --skip) decides PASS and
writes certificate.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from checker import certificate as certificate_mod
from checker import checks
from checker import geometry as geo

_SKIPPABLE = {"C1", "C2", "C3", "C4", "C5"}


def load_json(path) -> dict:
    return json.loads(Path(path).read_text())


def discover_times_ms(run_dir: Path) -> list[int]:
    return sorted(int(p.name.split("_", 1)[1]) for p in run_dir.glob("t_*") if p.is_dir())


def _not_run_stub(check_name: str, thresholds: dict) -> dict:
    return {
        "check": check_name,
        "status": "NOT RUN",
        "value": {},
        "limit": thresholds.get(check_name, {}),
        "details": [],
        "note": "explicitly skipped (--skip)",
    }


def _git_stamp() -> dict:
    """Which commit produced this report (and whether the working tree had edits), so a
    number can't be cited under a different checker than the one that computed it."""
    def git(*args):
        return subprocess.run(["git", *args], capture_output=True, text=True, timeout=10, cwd=Path(__file__).resolve().parent.parent)
    try:
        commit = git("rev-parse", "HEAD").stdout.strip() or None
        dirty = bool(git("status", "--porcelain", "--", "checker", "config", "schemas").stdout.strip()) if commit else None
    except (OSError, subprocess.SubprocessError):
        commit, dirty = None, None
    return {"git_commit": commit, "checker_files_modified": dirty}


def run(run_dir, true_screen_path, thresholds_path, out_path, skip: list[str] = ()) -> dict:
    run_dir = Path(run_dir)
    scene = load_json(run_dir / "scene.json")
    assumed_screen = load_json(run_dir / "assumed_screen.json")
    anchors_doc = load_json(run_dir / "anchors.json")
    true_screen = geo.load_screen(true_screen_path)  # also asserts panels face eye
    thresholds = load_json(thresholds_path)
    times_ms = discover_times_ms(run_dir)

    skip = set(skip)
    unknown = skip - _SKIPPABLE
    if unknown:
        raise ValueError(f"--skip got unknown check name(s) {sorted(unknown)}; expected a subset of {sorted(_SKIPPABLE)}")

    def maybe(name, compute):
        return _not_run_stub(name, thresholds) if name in skip else compute()

    hard_checks = [
        maybe("C1", lambda: checks.compute_c1(run_dir, true_screen, times_ms)),
        maybe("C2", lambda: checks.compute_c2(assumed_screen, true_screen, anchors_doc, thresholds)),
        maybe("C3", lambda: checks.compute_c3(assumed_screen, true_screen, scene, anchors_doc, thresholds)),
        maybe("C4", lambda: checks.compute_c4(run_dir, scene, true_screen, thresholds, times_ms)),
        maybe("C5", lambda: checks.compute_c5(scene, true_screen, thresholds)),
    ]
    # Diagnostic cross-checks against P1's actual renders (idpass_street.png,
    # mask_ref.png) -- informational only, never part of overall (CLAUDE.md
    # Section 6 steps 4 and 7; "Argon proposes, the checker decides" means
    # the 5 named checks above, not these). C4_analytic_xcheck is the
    # surface-sample proxy that used to be C4's own authority -- kept
    # visible since it's a useful pre-render estimate, but demoted once a
    # real mask_ref.png is available (see checks.compute_c4). Both degrade
    # gracefully (near-empty, harmless results) when no renders exist.
    c4_analytic_xcheck = dict(checks.compute_c4_analytic(scene, true_screen, thresholds))
    c4_analytic_xcheck["check"] = "C4_analytic_xcheck"
    # Diagnostic, like the other xchecks: report the value but no PASS/FAIL. Its unit is
    # sample count (1 of 28 samples = 3.6%), not pixel area, so comparing it with C4's
    # limit would show a red FAIL on a run whose real C4 (mask) passes.
    c4_analytic_xcheck["analytic_status_vs_limit"] = c4_analytic_xcheck["status"]
    c4_analytic_xcheck["status"] = None
    xchecks = [
        checks.compute_c2_image_crosscheck(run_dir, assumed_screen, true_screen, anchors_doc, times_ms),
        checks.compute_c4_mask_crosscheck(run_dir, true_screen, times_ms),
        c4_analytic_xcheck,
    ]
    # C6 (info only): sweet-spot heatmap, if the TRUE screen has a viewing_zone.
    c6_report = checks.compute_c6_zone_heatmap(assumed_screen, true_screen, anchors_doc, thresholds)
    checks.render_zone_heatmap_png(c6_report, thresholds, run_dir / "zone_heatmap.png")
    check_reports = hard_checks + xchecks + [c6_report]

    # NOT APPLICABLE (e.g. C3 on a screen with no declared seams) is not a
    # failure -- there was nothing for that check to find wrong. NOT RUN
    # (a --skip'd check) is NOT given the same pass -- a skipped check is
    # an incomplete result, not a verified one, so it must block overall
    # and the certificate (see module docstring).
    overall = "PASS" if all(r["status"] in ("PASS", "NOT APPLICABLE") for r in hard_checks) else "FAIL"
    report = {
        "run": f"{run_dir.parent.name}/{run_dir.name}",
        "checks": check_reports,
        "overall": overall,
        "failure_times_s": checks.compute_failure_times_s(hard_checks),
        "worst_by_check": checks.compute_worst_by_check(hard_checks, c4_analytic_xcheck.get("example_offenders")),
        # Which limits decided this report: cite a number only under the thresholds stamped here.
        "thresholds": thresholds,
        "thresholds_sha256": hashlib.sha256(Path(thresholds_path).read_bytes()).hexdigest(),
        **_git_stamp(),
    }
    if skip:
        report["skipped"] = sorted(skip)
    Path(out_path).write_text(json.dumps(report, indent=2))
    certificate_mod.write_certificate(run_dir, true_screen_path, thresholds, report)
    return report


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="render output dir + true screen spec -> report.json")
    parser.add_argument("--dir", required=True)
    parser.add_argument("--true", required=True)
    parser.add_argument("--thresholds", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--skip", nargs="+", default=[], metavar="CHECK", help="check names to mark NOT RUN, e.g. --skip C1")
    args = parser.parse_args(argv)

    report = run(args.dir, args.true, args.thresholds, args.out, skip=args.skip)
    print(f"{report['run']}: overall {report['overall']} -> {args.out}")
    for c in report["checks"]:
        print(f"  {c['check']}: {c['status']} value={c['value']}")


if __name__ == "__main__":
    main()
