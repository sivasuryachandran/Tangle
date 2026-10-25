"""Hero can label texture via Nano Banana (gemini-nano-banana-2.1) from the user-confirmed brand facts.
Writes inputs/<run_id>/label.png (exactly 2048x1024) and the scene's hero object gets "label_image": "<that path>"."""
import json
from pathlib import Path

import cv2
import numpy as np

from agent.gemini import ROOT, generate_image

W, H = 2150, 1024  # ~2.1:1 = can circumference 2.51 m : height 1.2 m (P1)
CREAM = "#F4E9D8"


def label_prompt(conf):
    name = (conf.get("label_text") or "").strip()
    cols = conf.get("colors") or []
    body = cols[0] if cols else "#D33333"
    band = cols[1] if len(cols) > 1 else CREAM
    lines = [
        f"Flat label artwork for a beverage can, a wide 2.1:1 landscape image, front-on, no perspective, no can or mockup, just the artwork.",
        f"The ENTIRE background is one perfectly flat solid color {body} with no gradient, texture, shadow or noise.",
        f"Centered in the image, one badge that is about 30 percent of the image width and never more than one third (so it is large and readable, with the left and right thirds left as empty background), nothing at all near the left or right edges: a rounded rectangle in {band}",
        f"containing the brand name \"{name}\" in bold black condensed sans-serif capitals, spelled exactly," if name else "containing no brand name,",
        "next to one small simple sun-burst mark.",
    ]
    if conf.get("tagline"):
        lines.append(f"Directly below the badge, very small clean sans-serif text: \"{conf['tagline']}\" (also within the central third).")
    lines.append("Style rules: no script or cursive lettering, no ribbons, no waves, no real brand logos or characters, invented brand only, no other text.")
    return " ".join(lines)


def to_label_png(img_bytes, body_hex="#D33333", tol=22):
    """Resize to 2150x1024 and make the flat background transparent (soft edge), so the can's own color shows through.
    The artwork background is the body color, so the result looks identical whether or not the renderer honors alpha."""
    im = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise RuntimeError("could not decode generated image")
    im = cv2.resize(im, (W, H), interpolation=cv2.INTER_LANCZOS4)
    bgr = np.array([int(body_hex[i:i + 2], 16) for i in (5, 3, 1)], np.float32)
    dist = np.linalg.norm(im.astype(np.float32) - bgr, axis=2)
    alpha = np.clip((dist - tol) / tol, 0, 1)            # 0 inside the flat background, ramps to 1 on artwork
    alpha = cv2.GaussianBlur(alpha, (0, 0), 1.0)
    return cv2.imencode(".png", np.dstack([im, (alpha * 255).astype(np.uint8)]))[1].tobytes()


def make_label(inputs_dir):
    """Generate inputs/<run_id>/label.png from confirmed.json. Returns the repo-relative path."""
    d = Path(inputs_dir)
    conf = json.loads((d / "confirmed.json").read_text())
    body = (conf.get("colors") or ["#D33333"])[0]
    png = to_label_png(generate_image(label_prompt(conf), tag="texture_label"), body)
    (d / "label.png").write_bytes(png)
    return str((d / "label.png").resolve().relative_to(ROOT))


def attach(scene, label_path):
    """Set label_image on the hero object (label_text, else first can)."""
    from agent.guard import hero_index
    hi = hero_index(scene)
    if hi is not None and scene["objects"][hi]["type"] == "can":
        scene["objects"][hi]["label_image"] = label_path
    return scene
