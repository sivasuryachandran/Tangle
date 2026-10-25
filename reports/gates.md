# Gates

## G0 — Argon call + video input (P3) — PASS (Oct 25)
- `gemini-4-argon` text call via Interactions API (`client.interactions.create`, `generation_config.thinking_level`): returned the expected string in 4.3 s, 47 tokens. Logged in `reports/model_calls.jsonl`.
- Video input: a 2 s local MP4 (red → blue, 320x180) sent **inline as base64**, `{"type":"video","data":<b64>,"mime_type":"video/mp4"}` plus a `{"type":"text"}` part. The model answered "Red, blue." Decision: use inline MP4 (no Files API); PNG-strip fallback not needed so far. Clip size limits for a real `street.mp4` NOT RUN yet.
- Notes: `client.files.upload` also works (file starts in PROCESSING state, so inline is simpler). The `genai.Client` must be kept referenced during the call or httpx reports "client has been closed".
