"""Optional creative inputs: product photos + brand guidelines -> editable brand facts for A1.
Only photos taken by the team or judges at the event; inputs/ is gitignored and never committed.
No geometry is ever read from model output here: screen geometry comes only from the user-confirmed form.
Module-level imports are stdlib-only so web/app/server.py can reuse the validation."""
import base64, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAX_IMAGES = 3
MAX_BYTES = 5 * 1024 * 1024
IMAGE_MIMES = {"image/png": ".png", "image/jpeg": ".jpg"}
OBJECT_TYPES = ["can", "box", "sphere", "text", "particles"]


class InputError(ValueError):
    pass


def normalize_hex(s):
    m = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", str(s).strip())
    if not m:
        raise InputError(f"not a hex color: {s!r}")
    h = m.group(1).upper()
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h


def validate_uploads(images, pdf=None):
    """images: list of {name, mime, bytes}. Raises InputError with a user-readable message."""
    if not 1 <= len(images) <= MAX_IMAGES:
        raise InputError(f"upload 1 to {MAX_IMAGES} photos (got {len(images)})")
    for im in images:
        if im["mime"] not in IMAGE_MIMES:
            raise InputError(f"{im['name']}: only PNG or JPG photos are accepted (got {im['mime']})")
        if len(im["bytes"]) > MAX_BYTES:
            raise InputError(f"{im['name']}: {len(im['bytes']) / 1e6:.1f} MB is over the 5 MB limit")
    if pdf is not None:
        if pdf["mime"] != "application/pdf":
            raise InputError(f"{pdf['name']}: brand guidelines must be a PDF or pasted text")
        if len(pdf["bytes"]) > MAX_BYTES:
            raise InputError(f"{pdf['name']}: {len(pdf['bytes']) / 1e6:.1f} MB is over the 5 MB limit")


def save_inputs(run_id, images, brand_text="", pdf=None):
    validate_uploads(images, pdf)
    d = ROOT / "inputs" / run_id
    d.mkdir(parents=True, exist_ok=True)
    for i, im in enumerate(images, 1):
        (d / f"photo_{i}{IMAGE_MIMES[im['mime']]}").write_bytes(im["bytes"])
    if pdf is not None:
        (d / "brand.pdf").write_bytes(pdf["bytes"])
    if brand_text.strip():
        (d / "brand.txt").write_text(brand_text.strip())
    return d


def image_parts(d):
    parts = []
    for p in sorted(Path(d).glob("photo_*")):
        mime = "image/png" if p.suffix == ".png" else "image/jpeg"
        parts.append({"type": "image", "data": base64.b64encode(p.read_bytes()).decode(), "mime_type": mime})
    return parts


def brand_parts(d):
    d = Path(d)
    parts = []
    if (d / "brand.pdf").exists():
        parts.append({"type": "document", "data": base64.b64encode((d / "brand.pdf").read_bytes()).decode(), "mime_type": "application/pdf"})
    if (d / "brand.txt").exists():
        parts.append({"type": "text", "text": "Brand guidelines (pasted text):\n" + (d / "brand.txt").read_text()})
    return parts


SYSTEM = """You read product photos and (optionally) brand guidelines for a billboard ad tool. Output ONLY one JSON object:
{"object_type": "can|box|sphere|text|particles", "colors": ["#RRGGBB", ...], "label_text": "<text>"|null, "other_text": ["..."],
 "brand": {"colors": ["#RRGGBB"], "tagline": "<text>"|null, "forbidden_words": ["..."]}}
Rules:
- object_type: the closest primitive to the product's shape (can = cylinder, box = package/carton, sphere = ball-like, text = no product, particles = loose items).
- colors: 1 to 3 brand/product colors of the PRODUCT itself (not the background, table, hands or shadows), most dominant first.
- label_text: only text that is legibly printed on the product. Transcribe it exactly. Never invent a logo, brand name or text; use null if nothing is readable.
- other_text: any other legible words on the product (may be empty).
- brand.*: ONLY from the provided brand guidelines (PDF or pasted text): brand colors, tagline, words the brand must never use. Use null / [] when no guidelines were provided or the field is absent. Do not guess.
- Do not output any screen, camera or geometry information."""


def parse_analysis(text):
    a, b = text.find("{"), text.rfind("}")
    if a < 0:
        raise InputError("model returned no JSON")
    raw = json.loads(text[a:b + 1])
    otype = raw.get("object_type")
    if otype not in OBJECT_TYPES:
        otype = "box"
    colors = []
    for c in (raw.get("colors") or [])[:3]:
        try:
            colors.append(normalize_hex(c))
        except InputError:
            pass
    label = raw.get("label_text")
    label = str(label).strip()[:24] if label else None
    brand = raw.get("brand") or {}
    bcolors = []
    for c in (brand.get("colors") or [])[:3]:
        try:
            bcolors.append(normalize_hex(c))
        except InputError:
            pass
    tag = brand.get("tagline")
    return {"object_type": otype, "colors": colors, "label_text": label,
            "other_text": [str(t)[:40] for t in (raw.get("other_text") or [])][:6],
            "brand": {"colors": bcolors, "tagline": str(tag).strip()[:60] if tag else None,
                      "forbidden_words": [str(w).strip().lower()[:30] for w in (brand.get("forbidden_words") or []) if str(w).strip()][:20]}}


def analyze(d):
    """One model call over the saved photos (+ brand PDF/text). Writes analysis.json and an editable brand.json."""
    from agent.gemini import generate  # lazy: needs google-genai
    d = Path(d)
    parts = image_parts(d) + brand_parts(d) + [{"type": "text", "text": "Extract the JSON now."}]
    out = parse_analysis(generate(parts, system=SYSTEM, thinking_level="low", tag="inputs_analyze"))
    (d / "analysis.json").write_text(json.dumps(out, indent=1))
    (d / "brand.json").write_text(json.dumps(out["brand"], indent=1))  # user-editable
    return out


def save_confirmed(d, conf):
    """User-confirmed (possibly edited) facts. Normalizes and validates; returns the cleaned dict."""
    d = Path(d)
    otype = conf.get("object_type")
    if otype not in OBJECT_TYPES:
        raise InputError(f"object_type must be one of {OBJECT_TYPES}")
    clean = {"object_type": otype,
             "colors": [normalize_hex(c) for c in (conf.get("colors") or [])][:3],
             "label_text": (str(conf["label_text"]).strip()[:24] or None) if conf.get("label_text") else None,
             "tagline": (str(conf["tagline"]).strip()[:60] or None) if conf.get("tagline") else None,
             "forbidden_words": [str(w).strip().lower() for w in (conf.get("forbidden_words") or []) if str(w).strip()][:20]}
    (d / "confirmed.json").write_text(json.dumps(clean, indent=1))
    (d / "brand.json").write_text(json.dumps({"colors": clean["colors"], "tagline": clean["tagline"], "forbidden_words": clean["forbidden_words"]}, indent=1))
    return clean


def load_confirmed(d):
    f = Path(d) / "confirmed.json"
    return json.loads(f.read_text()) if f.exists() else None


def brand_violations(scene, conf):
    """Semantic checks of an A1 scene against the user-confirmed facts."""
    out = []
    texts = [(o["id"], o.get("text", "")) for o in scene["objects"] if o["type"] == "text"] + \
            [(o["id"], o.get("label_text", "")) for o in scene["objects"] if o.get("label_text")]
    for w in conf.get("forbidden_words") or []:
        for oid, t in texts:
            if t and re.search(rf"\b{re.escape(w)}\b", t, re.I):
                out.append(f"forbidden word '{w}' appears in '{oid}' ({t!r})")
    otype = conf.get("object_type")
    if otype and otype != "text":
        heroes = [o for o in scene["objects"] if o["type"] == otype]
        if not heroes:
            out.append(f"no object of the confirmed type '{otype}'")
        else:
            h = heroes[0]
            cols = conf.get("colors") or []
            if cols and normalize_hex(h.get("color", "#000")) != cols[0]:
                out.append(f"hero '{h['id']}' color must be {cols[0]} (got {h.get('color')})")
            if conf.get("label_text") and str(h.get("label_text", "")).strip().lower() != conf["label_text"].lower():
                out.append(f"hero '{h['id']}' label_text must be {conf['label_text']!r}")
    if conf.get("tagline") and not any(conf["tagline"].lower().rstrip(".!") in t.lower() for _, t in texts if t):
        out.append(f"a text object must show the tagline {conf['tagline']!r}")
    return out


def prompt_block(conf):
    lines = ["Confirmed brand inputs from the user (follow exactly; photos are shape/colour reference only):",
             f"- Hero object type: {conf.get('object_type')}"]
    if conf.get("colors"):
        lines.append(f"- Hero color: {conf['colors'][0]}" + (f" (other brand colors you may use for accents: {', '.join(conf['colors'][1:])})" if len(conf['colors']) > 1 else ""))
    if conf.get("label_text"):
        lines.append(f"- Hero label_text: {conf['label_text']!r}")
    if conf.get("tagline"):
        lines.append(f"- A text object must show this tagline: {conf['tagline']!r}")
    if conf.get("forbidden_words"):
        lines.append(f"- Never use these words in any text or label: {', '.join(conf['forbidden_words'])}")
    lines.append("- Do not invent a logo, brand name or any text that is not given above or in the brief.")
    return "\n".join(lines)


if __name__ == "__main__":  # python -m agent.inputs --dir inputs/<id>  -> prints analysis JSON
    import argparse, sys
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    try:
        print(json.dumps(analyze(ap.parse_args().dir)))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
