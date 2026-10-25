"""Narration audio for the 1-minute video. Same TTS setup as the Gasket demo: Google Cloud Text-to-Speech, Chirp 3: HD voice Orus,
short-lived gcloud token read at run time (no key is read, stored or printed).
  python demo/build_audio.py            -> every segment whose numbers are available (values.json) or that has none
Numbers are only ever filled from demo/values.json (built from runs/*/v*/report.json); a segment that needs a value that is missing is skipped."""
import base64, json, subprocess, sys, urllib.request
from pathlib import Path
D = Path(__file__).resolve().parent
PROJECT = "gasket-demo"      # the Cloud TTS API is enabled here (same project the Gasket video used)

def synth(text, voice, out, rate):
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    body = {"input": {"text": text}, "voice": {"languageCode": "en-US", "name": f"en-US-Chirp3-HD-{voice}"},
            "audioConfig": {"audioEncoding": "MP3", "sampleRateHertz": 24000, "speakingRate": rate}}
    req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {token}", "x-goog-user-project": PROJECT, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        Path(out).write_bytes(base64.b64decode(json.load(r)["audioContent"]))

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], text=True))

def main():
    nar = json.loads((D / "narration.json").read_text())
    vals = json.loads((D / "values.json").read_text()) if (D / "values.json").exists() else {}
    path = "A" if vals.get("passed") else "B" if vals else None
    (D / "audio").mkdir(exist_ok=True); durs = {}
    for s in nar["segments"]:
        if s.get("path") and s["path"] != path:
            continue
        miss = [k for k in s.get("needs", []) if vals.get(k) is None]
        if miss:
            print(f"skip {s['id']}: needs {miss} from values.json"); continue
        text = s["text"].format(**{k: vals[k] for k in s.get("needs", [])})
        out = D / "audio" / f"{s['id']}.mp3"
        synth(text, nar["voice"], out, nar["rate"]); durs[s["id"]] = round(dur(out), 2)
        print(f"{s['id']:6} {durs[s['id']]:5.2f}s  {text}")
    old = json.loads((D / "audio" / "durations.json").read_text()) if (D / "audio" / "durations.json").exists() else {}
    old.update(durs); (D / "audio" / "durations.json").write_text(json.dumps(old, indent=1))
    print("total so far: %.1f s" % sum(old.values()))

if __name__ == "__main__":
    main()
