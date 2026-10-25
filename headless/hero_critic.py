"""Gemini art-director loop for the hero page (P1). Uses agent/gemini.py, so every call is timed out,
cached, logged to reports/model_calls.jsonl, and a 429 stops everything (no retries).

  python headless/hero_critic.py target --ref runs/hero/rN/overview.png     -> web/hero/target_01.png
  python headless/hero_critic.py critic --shots runs/hero/rN --round N      -> prints and logs score + flaws
"""
import argparse
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from agent.gemini import RateLimited, _log, generate, generate_image  # noqa: E402

TARGET_PNG = ROOT / "web" / "hero" / "target_01.png"
VIEWS = ["overview", "closeup", "low", "wire"]


def img_part(path):
    p = Path(path)
    mime = "image/jpeg" if p.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return {"type": "image", "data": base64.b64encode(p.read_bytes()).decode(), "mime_type": mime}


def make_target(ref):
    prompt = [
        img_part(ref),
        {"type": "text", "text": (
            "This is a rough real-time render of an out-of-home advertisement: a red beverage can with a cream FLARE label, "
            "shown as a 3D pop-out on a corner LED screen of a building, on a rainy night street. "
            "Create a photorealistic 2K concept photograph of the same scene from the same camera: same composition, "
            "same corner building with the glowing screen, same can with the FLARE label (invented brand, keep the label as is), "
            "orange sparks around it, two street lamps left and right, wet asphalt with reflections of the screen and lamps, "
            "distant city windows. Premium advertising photography: brushed aluminium rim, glossy red body with condensation droplets, "
            "soft glow of the screen on the road, cinematic lighting, shallow haze. No people, no text other than the can label, no UI.")},
    ]
    data = generate_image(prompt, tag="hero_target")
    TARGET_PNG.parent.mkdir(parents=True, exist_ok=True)
    TARGET_PNG.write_bytes(data)
    print("wrote", TARGET_PNG, len(data), "bytes")


CRITIC_PROMPT = """You are a ruthless art director reviewing a real-time three.js render of a night street ad.
Image 1 is the TARGET (a photoreal concept of what we want, reference only). Images 2-5 are our render:
2 = three-quarter overview, 3 = close-up at the viewing position, 4 = low angle, 5 = wireframe (geometry check).
Judge how close and how premium the render looks versus the target: can materials (aluminium rim, glossy body,
clearcoat, condensation), label legibility, lamp light and soft shadows, wet-road reflections, screen glow on the road,
bloom/exposure, composition, clutter, anything that looks CGI-cheap or broken.
Reply with JSON only: {"score": <0-10, one decimal>, "flaws": [{"where": "...", "issue": "...", "fix": "..."}], "keep": ["..."]}
Give at least 3 specific flaws, each with a concrete fix expressed as a parameter or geometry change (for example
"lower bloomStrength to 0.2", "raise lampIntensity", "make the road roughness map less noisy"). Be strict: 9+ means
you would publish it as the hero of a product launch."""


def critic(shots, rnd):
    parts = [{"type": "text", "text": CRITIC_PROMPT}, img_part(TARGET_PNG)]
    for v in VIEWS:
        parts.append(img_part(Path(shots) / f"{v}.png"))
    text = generate(parts, thinking_level="medium", tag=f"hero_critic_round{rnd}", use_cache=False)
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.find("{"):]
    try:
        out = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
    except Exception:
        out = {"score": None, "flaws": [], "raw": text}
    _log({"tag": f"hero_critic_round{rnd}_result", "score": out.get("score"), "n_flaws": len(out.get("flaws", [])),
          "shots": str(shots)})
    Path(shots, "critic.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("target")
    t.add_argument("--ref", required=True)
    c = sub.add_parser("critic")
    c.add_argument("--shots", required=True)
    c.add_argument("--round", type=int, required=True)
    a = ap.parse_args()
    try:
        if a.cmd == "target":
            make_target(a.ref)
        else:
            critic(a.shots, a.round)
    except RateLimited as e:
        print(f"STOP: {e}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
