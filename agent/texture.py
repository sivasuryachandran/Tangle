"""Hero can label texture via Nano Banana (gemini-nano-banana-2.1) from the user-confirmed brand facts.
Writes inputs/<run_id>/label.png (exactly 2048x1024) and the scene's hero object gets "label_image": "<that path>"."""
import json
from pathlib import Path

import cv2
import numpy as np

from agent.gemini import ROOT, generate_image

W, H = 2048, 1024
CREAM = "#F4E9D8"


def label_prompt(conf):
    name = (conf.get("label_text") or "").strip()
    cols = conf.get("colors") or []
    body = cols[0] if cols else "#D33333"
    band = cols[1] if len(cols) > 1 else CREAM
    lines = [
        "Flat wrap-around label artwork for a beverage can, a wide 2:1 panorama, front-on, no perspective, no can or mockup, just the artwork.",
        f"Background fill: {body}. A horizontal band across the vertical middle in {band}.",
        f"On the band, the brand name \"{name}\" in bold black condensed sans-serif capitals, spelled exactly, centered." if name else "No brand name text.",
        "One small simple sun-burst mark next to the name.",
    ]
    if conf.get("tagline"):
        lines.append(f"Below the band, small clean sans-serif text: \"{conf['tagline']}\".")
    lines.append("Style rules: no script or cursive lettering, no ribbons, no waves, no real brand logos or characters, invented brand only, no other text.")
    return " ".join(lines)


def to_2048x1024_png(img_bytes):
    im = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if im is None:
        raise RuntimeError("could not decode generated image")
    return cv2.imencode(".png", cv2.resize(im, (W, H), interpolation=cv2.INTER_LANCZOS4))[1].tobytes()


def make_label(inputs_dir):
    """Generate inputs/<run_id>/label.png from confirmed.json. Returns the repo-relative path."""
    d = Path(inputs_dir)
    conf = json.loads((d / "confirmed.json").read_text())
    png = to_2048x1024_png(generate_image(label_prompt(conf), tag="texture_label"))
    (d / "label.png").write_bytes(png)
    return str((d / "label.png").resolve().relative_to(ROOT))


def attach(scene, label_path):
    """Set label_image on the hero object (label_text, else first can)."""
    from agent.guard import hero_index
    hi = hero_index(scene)
    if hi is not None and scene["objects"][hi]["type"] == "can":
        scene["objects"][hi]["label_image"] = label_path
    return scene
