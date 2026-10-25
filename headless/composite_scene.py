"""Put our screen content into the AI-generated street photo (scene.jpeg), so the demo reads as a real corner billboard.

  python headless/composite_scene.py --panels runs/hero/panels --out runs/hero/composite.png
  python headless/composite_scene.py --frames runs/hero/frames --fps 30 --out runs/hero/composite.mp4   (needs ffmpeg)

The photo is AI-generated (not a real location) and is only a backdrop: the two inner faces of the glowing
frame are replaced by our panel images (L, R) through a perspective warp, then a soft glow is added around
the frame and on the wet road. Nothing here feeds the checker.
"""
import argparse
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
# Inner opening of the frame in scene.jpeg (1376x768): left face and right face, TL, TR, BR, BL (found from the image).
QUADS = {
    "L": [(528, 225), (684, 128), (688, 357), (523, 375)],
    "R": [(684, 128), (860, 215), (862, 371), (688, 357)],
}
CAPTION = "AI-generated environment, not a real location."


def find_ffmpeg():
    cands = ["ffmpeg"]
    base = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    if base.exists():
        cands += [str(p) for p in base.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe")]
    for c in cands:
        try:
            if subprocess.run([c, "-version"], capture_output=True).returncode == 0:
                return c
        except FileNotFoundError:
            pass
    raise SystemExit("ffmpeg not found")


class Composer:
    def __init__(self, bg_path, cfg=None):
        global QUADS
        cfg = cfg or {}
        if cfg.get('quads'):
            QUADS = {k: [tuple(p) for p in v] for k, v in cfg['quads'].items()}
        self.road_y = cfg.get('road', [395, 760])
        raw = cv2.imread(str(bg_path))
        raw = self.remove_original_can(raw) if cfg.get('remove_original', Path(bg_path).name == 'scene.jpeg') else raw
        self.bg = raw.astype(np.float32) / 255.0
        self.h, self.w = self.bg.shape[:2]
        self.masks = {}
        for k, q in QUADS.items():
            m = np.zeros((self.h, self.w), np.uint8)
            cv2.fillConvexPoly(m, np.array(q, np.int32), 255, lineType=cv2.LINE_AA)
            self.masks[k] = cv2.GaussianBlur(m.astype(np.float32) / 255.0, (0, 0), 0.8)
        union = np.clip(sum(self.masks.values()), 0, 1)
        self.union = union
        # the original can/splash sits inside the opening: wipe it first with a dark recess
        self.dark = np.array([0.03, 0.02, 0.02], np.float32)
        yy = np.arange(self.h)[:, None]
        # soft light pool on the wet road and sidewalk below the screen
        self.road = np.clip((yy - self.road_y[0]) / 40.0, 0, 1) * np.clip((self.road_y[1] - yy) / 120.0, 0, 1) * np.ones((1, self.w), np.float32)
        rng = np.random.default_rng(3)
        self.grain = rng.normal(0, 0.012, (self.h, self.w, 1)).astype(np.float32)

    @staticmethod
    def remove_original_can(img):
        # The photo's own can lid and splash overlap the glowing frame and the dark wall beyond it. Pixels that fall
        # on the frame band are repainted with the band colour, the rest (dark wall) is inpainted.
        m = np.zeros(img.shape[:2], np.uint8)
        for poly in ([(734, 146), (765, 138), (798, 154), (806, 188), (794, 199), (743, 180)],
                     [(801, 150), (840, 148), (900, 150), (903, 200), (852, 210), (812, 212), (798, 198)]):
            cv2.fillPoly(m, [np.array(poly, np.int32)], 255)
        cv2.circle(m, (821, 141), 12, 255, -1)
        band = np.zeros(img.shape[:2], np.uint8)   # glowing frame band, top-right diagonal and right vertical
        cv2.fillPoly(band, [np.array([(688, 104), (907, 218), (907, 392), (862, 371), (860, 215), (684, 128)], np.int32)], 255)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        clean = ((hsv[:, :, 0] > 8) & (hsv[:, :, 0] < 28) & (hsv[:, :, 1] > 110) & (hsv[:, :, 2] > 190)).astype(np.uint8)
        clean[:, :] = clean * (cv2.dilate(m, np.ones((9, 9), np.uint8)) == 0)
        ys, xs = np.nonzero(clean[130:230, 560:660])
        col = np.median(img[130:230, 560:660][ys, xs], axis=0) if len(ys) else np.array([110, 190, 255])
        on_band = (m > 0) & (band > 0)
        out = img.copy()
        out[on_band] = col.astype(np.uint8)
        rest = ((m > 0) & ~on_band)
        dark = np.median(img[96:132, 830:905].reshape(-1, 3), axis=0)   # dark wall above the frame, no splash there
        out[rest] = dark.astype(np.uint8)
        # feather the repainted edges so they do not look cut out
        edge = cv2.GaussianBlur((m > 0).astype(np.float32), (0, 0), 1.6)[..., None]
        sharp = out.astype(np.float32)
        blur = cv2.GaussianBlur(sharp, (0, 0), 1.4)
        inner = (m > 0).astype(np.float32)[..., None]
        out = (sharp * inner + (sharp * (1 - edge) + blur * edge) * (1 - inner)).astype(np.uint8)
        return out

    def warp(self, name, img):
        hh, ww = img.shape[:2]
        src = np.array([[0, 0], [ww, 0], [ww, hh], [0, hh]], np.float32)
        dst = np.array(QUADS[name], np.float32)
        Hm = cv2.getPerspectiveTransform(src, dst)
        return cv2.warpPerspective(img, Hm, (self.w, self.h), flags=cv2.INTER_AREA if ww > self.w else cv2.INTER_LINEAR)

    def compose(self, panel_imgs):
        out = self.bg * (1 - self.union[..., None]) + self.dark * self.union[..., None]
        screen = np.zeros_like(self.bg)
        for k, img in panel_imgs.items():
            wp = self.warp(k, img.astype(np.float32) / 255.0)
            screen += wp * self.masks[k][..., None]
        screen = np.clip(screen * 1.05, 0, 1.4)
        screen = cv2.GaussianBlur(screen, (0, 0), 0.7)   # match the photo's softness
        out = out + screen
        # glow: the LED light spreads over the facade, the frame and the road
        glow = cv2.GaussianBlur(screen, (0, 0), 70) * 0.55 + cv2.GaussianBlur(screen, (0, 0), 22) * 0.75 + cv2.GaussianBlur(screen, (0, 0), 7) * 0.25
        out = out + glow * (1 - self.union[..., None] * 0.8)
        # reflection tint on the wet road under the screen
        avg = screen.reshape(-1, 3)[self.union.reshape(-1) > 0.5].mean(axis=0) if (self.union > 0.5).any() else np.zeros(3, np.float32)
        road_glow = cv2.GaussianBlur(self.road, (0, 0), 25)[..., None] * avg[None, None, :] * 1.1
        out = out + road_glow
        out = out + self.grain * (0.4 + out.mean(axis=2, keepdims=True))
        return np.clip(out, 0, 1)


def caption(img8):
    h, w = img8.shape[:2]
    (tw, th), _ = cv2.getTextSize(CAPTION, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    x0, y0, x1, y1 = 10, h - th - 22, 10 + tw + 12, h - 8
    roi = img8[y0:y1, x0:x1].astype(np.float32)
    img8[y0:y1, x0:x1] = (roi * 0.35).astype(np.uint8)          # dark plate so the line reads on any background
    cv2.putText(img8, CAPTION, (x0 + 6, y1 - 7), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 242, 248), 1, cv2.LINE_AA)
    return img8


def read_panels(d):
    return {k: cv2.imread(str(Path(d) / f"{k}.png")) for k in QUADS}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bg", default=str(ROOT / "scene.jpeg"))
    ap.add_argument("--config", help="json with bg, quads, road, remove_original (see web/hero/photo_demo/bg_corner.json)")
    ap.add_argument("--panels")
    ap.add_argument("--frames")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--out", required=True)
    ap.add_argument("--scale", type=float, default=1.0, help="output scale, e.g. 1.5 for 2064x1152")
    a = ap.parse_args()
    import json
    cfg = json.loads(Path(a.config).read_text()) if a.config else {}
    comp = Composer(str(ROOT / cfg['bg']) if cfg.get('bg') else a.bg, cfg)
    if a.panels:
        img = comp.compose(read_panels(a.panels))
        out = caption((img * 255).astype(np.uint8))
        cv2.imwrite(a.out, out)
        print("wrote", a.out)
        return
    frames = sorted(Path(a.frames).glob("f_*"))
    if not frames:
        sys.exit("no frames")
    ff = subprocess.Popen([find_ffmpeg(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{comp.w}x{comp.h}",
                           "-r", str(a.fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an", a.out],
                          stdin=subprocess.PIPE)
    for d in frames:
        img = comp.compose(read_panels(d))
        ff.stdin.write(caption((img * 255).astype(np.uint8)).tobytes())
    ff.stdin.close()
    ff.wait()
    print("wrote", a.out, len(frames), "frames")


if __name__ == "__main__":
    main()
