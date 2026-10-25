"""Turn the raw Nano Banana images for the race-car ad into the game-ready assets used by web/hero/race_content.js.

  python headless/race_assets.py

Inputs (web/hero/assets/): race_car_body_raw.png, race_wheel_raw.png, race_track_strip_raw.png, race_trees_strip_raw.png,
race_smoke_raw.png. Outputs: race_car.png (alpha, cropped), race_wheel.png (round alpha), race_track.png and race_trees.png
(seamless strips), race_smoke.png (white-on-black sprite), race_meta.json (wheel positions in the car image).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

A = Path(__file__).resolve().parent.parent / "web" / "hero" / "assets"


def load(n):
    return Image.open(A / n).convert("RGB")


def alpha_from_black(im, lo=14, hi=70):
    a = np.asarray(im).astype(np.float32)
    m = a.max(axis=2)
    alpha = np.clip((m - lo) / (hi - lo), 0, 1)
    return alpha


def seamless(im, blend=0.12):
    """Make a strip tile horizontally: cross-fade the right edge into the left edge (roll by half, blend the seam)."""
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    b = int(w * blend)
    out = a.copy()
    left, right = a[:, :b], a[:, w - b:]
    ramp = np.linspace(0, 1, b)[None, :, None]
    # the last b columns fade into the first b columns' content, so column w-1 meets column 0 continuously
    out[:, w - b:] = right * (1 - ramp) + left * ramp
    return Image.fromarray(out.astype(np.uint8))


# car: alpha from the black background, cropped to the car
car = load("race_car_body_raw.png")
al = alpha_from_black(car)
ys, xs = np.nonzero(al > 0.2)
x0, x1, y0, y1 = max(0, xs.min() - 6), min(car.width, xs.max() + 7), max(0, ys.min() - 6), min(car.height, ys.max() + 7)
rgb = np.asarray(car).astype(np.float32)
# un-premultiply against black so the edges do not carry a dark fringe
a2 = np.clip(al, 1e-3, 1)[..., None]
rgb = np.clip(rgb / np.maximum(a2, 0.35), 0, 255)
car_rgba = np.dstack([rgb, al * 255]).astype(np.uint8)[y0:y1, x0:x1]
Image.fromarray(car_rgba).save(A / "race_car.png")
ch, cw = car_rgba.shape[:2]

# wheel: round alpha around the tyre
w = load("race_wheel_raw.png")
wa = np.asarray(w).astype(np.float32)
m = wa.max(axis=2)
yy, xx = np.mgrid[0:w.height, 0:w.width]
cx, cy = w.width / 2, w.height / 2
ys, xs = np.nonzero(m > 40)
r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2
cx, cy = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2
d = np.hypot(xx - cx, yy - cy)
alpha = np.clip((r - d) / 3.0, 0, 1)
sq = int(r * 2 + 8)
x0w, y0w = int(cx - sq / 2), int(cy - sq / 2)
wheel = np.dstack([wa, alpha * 255]).astype(np.uint8)
wheel = np.pad(wheel, ((sq, sq), (sq, sq), (0, 0)))[y0w + sq:y0w + sq + sq, x0w + sq:x0w + sq + sq]
Image.fromarray(wheel).resize((512, 512), Image.LANCZOS).save(A / "race_wheel.png")

# strips
for src, dst in (("race_track_strip_raw.png", "race_track.png"), ("race_trees_strip_raw.png", "race_trees.png")):
    if (A / src).exists():
        s = seamless(load(src))
        s = s.resize((2048, 512), Image.LANCZOS)
        s.save(A / dst)

# smoke: luminance sprite
if (A / "race_smoke_raw.png").exists():
    sm = load("race_smoke_raw.png")
    g = np.asarray(sm).astype(np.float32).max(axis=2)
    g = np.clip((g - 12) / 200, 0, 1)
    yy, xx = np.mgrid[0:sm.height, 0:sm.width]
    fade = np.clip(1 - np.hypot((xx - sm.width / 2) / (sm.width / 2), (yy - sm.height / 2) / (sm.height / 2)), 0, 1) ** 0.6
    out = (g * fade * 255).astype(np.uint8)
    Image.fromarray(np.dstack([out, out, out]).astype(np.uint8)).resize((256, 256), Image.LANCZOS).save(A / "race_smoke.png")

# wheel centres in the car image (fractions of the cropped car): picked from the axle stubs of the generated body, tuned by eye
meta_path = A / "race_meta.json"
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
meta["car"] = {"w": int(cw), "h": int(ch), "crop": [int(x0), int(y0), int(x1), int(y1)]}
meta.setdefault("wheels", [])
meta_path.write_text(json.dumps(meta, indent=1))
print("car", cw, "x", ch, "crop", (x0, y0, x1, y1))
