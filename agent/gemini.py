"""Gemini client wrapper: hard timeout, fail fast on 429, cache by request hash, usage log."""
import base64, hashlib, json, os, subprocess, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIMEOUT_S = 120


class RateLimited(RuntimeError):
    pass


def _load_env():
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def _client():
    from google import genai
    from google.genai import types
    _load_env()
    return genai.Client(http_options=types.HttpOptions(timeout=TIMEOUT_S * 1000))


MAX_INLINE_BYTES = 15 * 1024 * 1024


class VideoTooLarge(RuntimeError):
    pass


def _log(rec):
    (ROOT / "reports").mkdir(exist_ok=True)
    with open(ROOT / "reports" / "model_calls.jsonl", "a") as f:
        f.write(json.dumps(rec, default=str) + "\n")


def video_part(path):
    """Inline video part. >15 MB is re-encoded (720p, 15 fps, <=10 s); still too big -> raise."""
    path = Path(path)
    size = path.stat().st_size
    if size > MAX_INLINE_BYTES:
        out = Path(tempfile.mkdtemp()) / "reencoded.mp4"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(path), "-t", "10", "-r", "15",
                        "-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-an", str(out)], check=True)
        new = out.stat().st_size
        _log({"tag": "video_reencode", "src": str(path), "bytes_before": size, "bytes_after": new})
        if new > MAX_INLINE_BYTES:
            raise VideoTooLarge(f"{path} is {size} B; still {new} B after 720p/15fps/10s re-encode (limit {MAX_INLINE_BYTES} B). Not sending.")
        path, size = out, new
    return {"type": "video", "data": base64.b64encode(path.read_bytes()).decode(), "mime_type": "video/mp4"}


def _usage(it):
    u = getattr(it, "usage", None) or getattr(it, "usage_metadata", None)
    if u is None:
        return None
    return u.model_dump() if hasattr(u, "model_dump") else str(u)


def generate(prompt, *, thinking_level="medium", system=None, use_cache=True, tag="call"):
    """Return output text. `prompt` is a str or list of parts accepted by the Interactions API."""
    _load_env()
    model = os.environ.get("GEMINI_MODEL", "gemini-4-argon")
    cfg = {"thinking_level": thinking_level}
    key = hashlib.sha256(json.dumps([model, cfg, system, prompt], sort_keys=True, default=str).encode()).hexdigest()
    cache = ROOT / "cache" / f"{key}.json"
    if use_cache and cache.exists():
        return json.loads(cache.read_text())["text"]
    kw = {"model": model, "input": prompt, "generation_config": cfg}
    if system:
        kw["system_instruction"] = system
    t0 = time.time()
    try:
        client = _client()
        it = client.interactions.create(**kw)
    except Exception as e:
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise RateLimited(f"HTTP 429 from Gemini — stopping, no retry: {e}") from e
        raise
    text = it.output_text
    rec = {"tag": tag, "model": model, "settings": cfg, "seconds": round(time.time() - t0, 2), "usage": _usage(it)}
    _log(rec)
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({"text": text, **rec}, default=str))
    return text


def generate_image(prompt, *, tag="image", model="gemini-nano-banana-2.1", use_cache=True):
    """One image from a Nano Banana model. Returns raw image bytes (JPEG/PNG as returned). Cached by request hash."""
    _load_env()
    key = hashlib.sha256(json.dumps([model, prompt], sort_keys=True).encode()).hexdigest()
    cache = ROOT / "cache" / f"{key}.img"
    if use_cache and cache.exists():
        return cache.read_bytes()
    t0 = time.time()
    client = _client()
    try:
        it = client.interactions.create(model=model, input=prompt)
    except Exception as e:
        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
            raise RateLimited(f"HTTP 429 from Gemini — stopping, no retry: {e}") from e
        raise
    oi = it.output_image
    if oi is None:
        raise RuntimeError("image model returned no image")
    data = base64.b64decode(oi.data) if isinstance(oi.data, str) else oi.data
    _log({"tag": tag, "model": model, "settings": {}, "seconds": round(time.time() - t0, 2), "usage": _usage(it)})
    cache.parent.mkdir(exist_ok=True)
    cache.write_bytes(data)
    return data
