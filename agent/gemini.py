"""Gemini client wrapper: hard timeout, fail fast on 429, cache by request hash, usage log."""
import hashlib, json, os, time
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
    (ROOT / "reports").mkdir(exist_ok=True)
    with open(ROOT / "reports" / "model_calls.jsonl", "a") as f:
        f.write(json.dumps(rec, default=str) + "\n")
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({"text": text, **rec}, default=str))
    return text
