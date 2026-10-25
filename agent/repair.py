"""A2: Argon watches street.mp4 + report.json + scene.json and proposes a JSON Patch (diagnosis + patch)."""
import argparse, json, sys
from pathlib import Path

import jsonschema

from agent import guard
from agent import timeline
from agent.gemini import ROOT, generate, video_part

PATCH_SCHEMA = json.loads((ROOT / "schemas" / "patch.schema.json").read_text())

SYSTEM = """You repair a 3D anamorphic billboard ad scene so it passes an independent geometry checker. You never change the screen, thresholds or checker; you may only edit the scene.
You will see: a video of the street-view simulation (what a pedestrian sees), the checker's report.json (authoritative: PASS/FAIL per check with measured values and limits), and the current scene.json.
Checks: C1 panel dimensions; C2 reprojection error (degrees; large when the content is the wrong geometry or objects sit far from the screen plane); C3 corner seam (text must not cross the corner; objects near the edge must not break); C4 out-of-bounds (hero objects leaving the visible screen area, percent); C5 text readability (arcmin, increase height_m).
Coordinates: meters, Y up, corner at origin. Panel L: plane z=0, x in [-8,0]. Panel R: plane x=0, z in [-8,0]. Panels are 6 m tall.
Allowed edits (RFC 6902 ops: replace/add/remove, at most 6 ops total):
- /objects/N/keyframes/... (N = index in the objects array; change t, pos, rot, scale; keyframes may be added), /objects/N/scale, /objects/N/height_m, /objects/N/color.
- You may NOT add or remove objects or touch any other path.
Constraints that are re-checked: every keyframe pos must be in the inside volume (x[-8,0], z[-8,0], y[0,6]) or the pop-out volume (x[0,3], z[0,3], y[1,5]); text on L has z in [-0.5,0] (x in [-8,0]), on R has x in [-0.5,0] (z in [-8,0]) and height_m >= 0.6. Scale 0 means not rendered. Objects don't exist before their first keyframe and hold after their last.
Hero rule (enforced by the guard, patches that break it are rejected): the hero object (the one with label_text, else the first can/box) must keep every keyframe scale >= 0.9x its ORIGINAL (v1) scale and never 0; at least one hero keyframe must stay in the pop-out volume; at most one non-hero object may be set to scale 0 per run. Fix errors by moving objects toward the screen planes or fixing timing, NOT by shrinking or deleting the hero.
Use the report's failing details (anchor, object, time, error) to pick the objects and times to change. Make the smallest patch that should fix the FAILing checks.
Also cite WHEN it breaks: "failure_timestamps_s" = the times in seconds (as shown in street.mp4, i.e. scene time) where the illusion visibly breaks; with no video, use the failing times from the report details.
Output ONLY a JSON object: {"diagnosis": "<what is wrong, citing check ids and numbers from the report>", "failure_timestamps_s": [seconds...], "patch": [ops]}."""


def _parse(text):
    a, b = text.find("{"), text.rfind("}")
    return json.loads(text[a:b + 1])


def repair(scene, report, video=None, thresholds=None, reference=None):
    """Return (diagnosis, patch, new_scene, extra) where extra = failure timestamps, the checker's failing times and their agreement. Raises guard.PatchRejected after one retry."""
    parts = []
    if video:
        parts.append(video_part(video))
    else:  # fast mode: without this note the model waits on a video that never comes and deliberates for minutes
        parts.append({"type": "text", "text": "NOTE: no video is provided this round (fast analytic mode). Work only from report.json and scene.json; do not mention a video."})
    body = f"report.json:\n{json.dumps(report)}\n\nthresholds:\n{json.dumps(thresholds)}\n\nscene.json (objects are indexed from 0 in array order):\n{json.dumps(scene)}"
    parts.append({"type": "text", "text": body})
    err = None
    for attempt in (1, 2):
        ps = parts if err is None else parts + [{"type": "text", "text": f"Your previous answer was rejected: {err}\nReturn a corrected JSON object."}]
        try:
            text = generate(ps, system=SYSTEM, thinking_level="medium", use_cache=err is None, tag=f"A2_attempt{attempt}")
        except Exception as e:  # one visible retry on a client-side timeout only; a 429 (RateLimited) still stops immediately
            if "timed out" not in str(e).lower():
                raise
            print(f"A2 attempt {attempt} TIMED OUT after 120 s — retrying once with thinking_level=low", file=sys.stderr)
            text = generate(ps, system=SYSTEM, thinking_level="low", use_cache=err is None, tag=f"A2_attempt{attempt}_retry_low")
        try:
            out = _parse(text)
            jsonschema.validate(out, PATCH_SCHEMA)
            new = guard.check(scene, out["patch"], reference)
            ts = [float(t) for t in out.get("failure_timestamps_s", [])]
            ck = timeline.checker_failure_times(report)
            extra = {"failure_timestamps_s": ts, "checker_failure_times_s": ck, "agreement": timeline.agreement(ts, ck)}
            return out["diagnosis"], out["patch"], new, extra
        except (json.JSONDecodeError, jsonschema.ValidationError, guard.PatchRejected) as e:
            err = getattr(e, "message", str(e))
            print(f"A2 attempt {attempt} rejected: {err}", file=sys.stderr)
    raise guard.PatchRejected(f"A2 failed after retry: {err}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="runs/<id>/v<N>")
    ap.add_argument("--thresholds", default=str(ROOT / "config" / "thresholds.json"))
    a = ap.parse_args()
    d = Path(a.dir)
    scene = json.loads((d / "scene.json").read_text())
    report = json.loads((d / "report.json").read_text())
    thr = json.loads(Path(a.thresholds).read_text()) if Path(a.thresholds).exists() else None
    mp4 = d / "street.mp4"
    diag, patch, _, extra = repair(scene, report, mp4 if mp4.exists() else None, thr)
    (d / "repair.json").write_text(json.dumps({"diagnosis": diag, "patch": patch, **extra}, indent=1))
    print(diag)
