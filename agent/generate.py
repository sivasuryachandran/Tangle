"""A1: brief + screen spec -> schema-valid scene.json (one retry on validation failure)."""
import argparse, json, re, sys
from pathlib import Path

import jsonschema

from agent.gemini import ROOT, generate

SCHEMA = json.loads((ROOT / "schemas" / "scene.schema.json").read_text())

RULES = """You design a 3D anamorphic ad for a physical 90-degree convex corner LED screen, seen by a pedestrian standing at the eye point.
Coordinates: meters, right-handed, Y up. The corner is at the origin. Panel L lies in the plane z=0 (x from -8 to 0) and panel R lies in the plane x=0 (z from 0 to -8); both are 6 m tall. The viewer's eye is at {eye}, looking at the corner.
Volumes (object centers must stay inside):
- Inside volume (behind the screens, appears recessed): x in [-8,0], z in [-8,0], y in [0,6].
- Pop-out volume (in front of the screens, appears to burst toward the viewer): x in [0,3], z in [0,3], y in [1,5], close to the eye-to-corner diagonal.
Rules:
- Object library at scale 1: can = cylinder r 0.4 h 1.2; box = 1x1x1; sphere r 0.5; text = height_m tall, width 0.6*height_m*characters; particles = 200 points in a 1 m sphere.
- Interpolation between keyframes is linear for pos and scale, and linear Euler degrees for rot.
- Objects don't exist before their first keyframe and hold after their last. To make something appear at t=7, give it a first keyframe at t=7.
- Text sits flat on ONE panel side only (never across the corner): on L use z about 0.05 and x in [-7,-1]; on R use x about 0.05 and z in [-7,-1] with rot [0,90,0]. Text height_m >= 0.6.
- No brand logos or copyrighted characters; invent any product name.
- Use at most 6 objects, duration_s <= 12, fps 30. Backdrop is {{"type":"room","depth_m":6,"color":"<hex>"}}.
- Output ONLY one JSON object conforming to the schema below. No markdown fences, no commentary.
Schema:
{schema}
"""


def _extract(text):
    m = re.search(r"\{.*\}", text, re.S)
    return json.loads(m.group(0) if m else text)


def make_scene(brief, screen_path=None, *, use_cache=True):
    screen = json.loads(Path(screen_path or ROOT / "screens" / "corner_90_demo.json").read_text())
    system = RULES.format(eye=screen["eye"], schema=json.dumps(SCHEMA))
    prompt = f"Brief: {brief}"
    err = None
    for attempt in (1, 2):
        p = prompt if err is None else f"{prompt}\n\nYour previous JSON failed validation: {err}\nReturn a corrected full JSON object."
        text = generate(p, system=system, thinking_level="medium", use_cache=use_cache, tag=f"A1_attempt{attempt}")
        try:
            scene = _extract(text)
            jsonschema.validate(scene, SCHEMA)
            return scene
        except (json.JSONDecodeError, jsonschema.ValidationError) as e:
            err = getattr(e, "message", str(e))
            print(f"A1 attempt {attempt} invalid: {err}", file=sys.stderr)
            use_cache = False
    raise RuntimeError(f"A1 failed schema validation after retry: {err}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True)
    ap.add_argument("--screen")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    scene = make_scene(a.brief, a.screen)
    Path(a.out).write_text(json.dumps(scene, indent=1) + "\n")
    print(f"wrote {a.out}")
