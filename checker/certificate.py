"""checker/certificate.py: on overall PASS, writes certificate.json with
the true spec hash, scene hash, thresholds, and every check's value.
CLAUDE.md Section 6 step 10 / Section 2 system flow.

A certificate is only ever issued by checker/run.py after every hard
check has passed -- Argon never marks a check as passed (CLAUDE.md
"Authority" note), and nothing here lets a caller force one through.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path


def _sha256_of_file(path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def build_certificate(run_dir, true_screen_path, thresholds: dict, report: dict) -> dict:
    if report["overall"] != "PASS":
        raise ValueError("a certificate is only built when report['overall'] == 'PASS'")
    run_dir = Path(run_dir)
    return {
        "run": report["run"],
        "issued_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "true_screen_path": str(true_screen_path),
        "true_screen_hash": "sha256:" + _sha256_of_file(true_screen_path),
        "scene_hash": "sha256:" + _sha256_of_file(run_dir / "scene.json"),
        "thresholds": thresholds,
        "thresholds_sha256": report.get("thresholds_sha256"),
        "checker_git_commit": report.get("git_commit"),
        "checks": [
            {"check": c["check"], "status": c["status"], "value": c["value"], "limit": c["limit"]}
            for c in report["checks"]
            if c["check"] in thresholds  # the 5 named hard checks only, not diagnostic cross-checks
        ],
        "overall": report["overall"],
    }


def write_certificate(run_dir, true_screen_path, thresholds: dict, report: dict, out_path=None) -> dict | None:
    """Writes certificate.json next to report.json if overall == PASS.
    Returns the certificate dict, or None (no file written) otherwise."""
    if report["overall"] != "PASS":
        return None
    cert = build_certificate(run_dir, true_screen_path, thresholds, report)
    out_path = Path(out_path) if out_path else Path(run_dir) / "certificate.json"
    out_path.write_text(json.dumps(cert, indent=2))
    return cert
