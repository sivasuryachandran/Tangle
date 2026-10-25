"""STUB renderer. Same CLI as headless/render.mjs; writes contract-shaped files that say STUB. NOT real renders."""
import argparse, json, subprocess, sys
from pathlib import Path

import cv2
import numpy as np

ap = argparse.ArgumentParser()
for k in ("scene", "assumed", "true", "anchors", "out", "times"):
    ap.add_argument("--" + k, required=True)
ap.add_argument("--video", action="store_true")
a = ap.parse_args()
out = Path(a.out)
(out).mkdir(parents=True, exist_ok=True)


def stub_png(path, w, h, text):
    img = np.full((h, w, 3), 40, np.uint8)
    cv2.putText(img, "STUB", (w // 8, h // 2), cv2.FONT_HERSHEY_SIMPLEX, w / 300, (60, 60, 255), 8)
    cv2.putText(img, text, (20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, w / 1200, (200, 200, 200), 2)
    cv2.imwrite(str(path), img)


for ms in a.times.split(","):
    d = out / f"t_{int(ms)}"
    d.mkdir(exist_ok=True)
    for name, (w, h) in {"L": (192, 144), "R": (192, 144), "street": (480, 270), "reference": (480, 270),
                         "idpass_street": (480, 270), "mask_ref": (480, 270)}.items():
        stub_png(d / f"{name}.png", w, h, f"fake {name} t={ms}ms")
json.dump({"STUB": True, "note": "fake anchors"}, open(out / "anchors.json", "w")) if not Path(a.anchors).exists() else None
if a.video:
    frames = out / "_frames"
    frames.mkdir(exist_ok=True)
    for i in range(20):
        stub_png(frames / f"{i:03d}.png", 480, 270, f"fake street video frame {i}")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", "10", "-i", str(frames / "%03d.png"),
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(out / "street.mp4")], check=True)
    for f in frames.iterdir():
        f.unlink()
    frames.rmdir()
print("STUB render done", file=sys.stderr)
