"""Assemble demo/tangle_1min.mp4 from the cards, the recorded shots and the narration audio. 1080p30 H.264, AAC 160k."""
import json, subprocess, sys
from pathlib import Path
D = Path(__file__).resolve().parent; O = D / "out"; (O / "seg").mkdir(parents=True, exist_ok=True)
dur = json.loads((D / "audio/durations.json").read_text()); nar = json.loads((D / "narration.json").read_text()); vals = json.loads((D / "values.json").read_text())
TAIL, GAP = 0.25, 0.1
shots = {0: ["s0"], 1: ["s1"], 2: ["s2"], 3: ["s3a", "s3b"], 4: ["s4a", "s4b_B" if not vals["passed"] else "s4b_A"], 5: ["s5"], 6: ["s6"]}
text = lambda i: next(s for s in nar["segments"] if s["id"] == i)["text"].format(**vals)
def run(*a): subprocess.run([str(x) for x in a], check=True, capture_output=True)
def audio(ids, secs, out):
    ins = []; fl = []
    for n, i in enumerate(ids):
        ins += ["-i", D / "audio" / f"{i}.mp3"]; delay = int(sum(dur[j] + GAP for j in ids[:n]) * 1000)
        fl.append(f"[{n}:a]adelay={delay}|{delay}[a{n}]")
    mix = "".join(f"[a{n}]" for n in range(len(ids))) + f"amix=inputs={len(ids)}:normalize=0,apad=whole_dur={secs:.3f},atrim=0:{secs:.3f}[o]"
    run("ffmpeg", "-y", *ins, "-filter_complex", ";".join(fl) + ";" + mix, "-map", "[o]", "-ar", "44100", "-ac", "2", out)
srt = []; t = 0.0; parts = []
for k, ids in shots.items():
    secs = sum(dur[i] for i in ids) + GAP * (len(ids) - 1) + TAIL
    a = O / "seg" / f"a{k}.wav"; audio(ids, secs, a); v = O / "seg" / f"v{k}.mp4"
    if k in (0, 6):
        png = O / "cards" / ("intro.png" if k == 0 else "outro.png")
        run("ffmpeg", "-y", "-loop", "1", "-t", f"{secs:.3f}", "-i", png, "-i", a, "-vf", f"fps=30,format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st={secs-0.3:.3f}:d=0.3", "-af", "afade=t=in:d=0.05",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", v)
    else:
        meta = json.loads((O / "clips" / f"shot{k}.json").read_text())
        run("ffmpeg", "-y", "-ss", f"{meta['start']:.3f}", "-t", f"{secs:.3f}", "-i", O / "clips" / f"shot{k}.webm", "-i", a, "-vf", "fps=30,scale=1920:1080,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", v)
    cur = t
    for i in ids:
        srt.append((cur, cur + dur[i], text(i))); cur += dur[i] + GAP
    t += secs; parts.append(v)
(O / "list.txt").write_text("".join(f"file '{p}'\n" for p in parts))
run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", O / "list.txt", "-c", "copy", "-movflags", "+faststart", D / "tangle_1min.mp4")
ts = lambda x: f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round((x-int(x))*1000)):03d}"
(D / "captions.srt").write_text("".join(f"{n+1}\n{ts(a)} --> {ts(b)}\n{tx}\n\n" for n, (a, b, tx) in enumerate(srt)))
d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", D / "tangle_1min.mp4"], text=True))
print("duration %.2f s" % d)
