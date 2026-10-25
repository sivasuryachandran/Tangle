"""Tangle UI server: serves the repo root + a few JSON endpoints. Run from anywhere:  python3 web/app/server.py [port]
GET  /api/runs            list runs (newest first)
GET  /api/screens         list screens/*.json
POST /api/screen          {corner_deg, eye_height, eye_dist, name?} -> writes screens/live_<ts>.json
POST /api/run             {brief|scene, true, assumed?, rounds?, stub?} -> starts loop.py, returns {run}
GET  /api/run/<id>        {status: running|done|failed, versions, log}
"""
import json, math, subprocess, sys, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROCS = {}
PY = str(ROOT / ".venv" / "bin" / "python") if (ROOT / ".venv" / "bin" / "python").exists() else sys.executable


def make_screen(corner_deg, eye_height, eye_dist, name):
    a = math.radians(corner_deg)
    dir_r = (-math.cos(a), 0, -math.sin(a))
    pb = [round(8 * dir_r[0], 4), 0, round(8 * dir_r[2], 4)]
    nL, nR = (0, 0, 1), (math.sin(a), 0, -math.cos(a))
    b = (nL[0] + nR[0], nL[2] + nR[2])
    n = math.hypot(*b)
    eye = [round(eye_dist * b[0] / n, 3), eye_height, round(eye_dist * b[1] / n, 3)]
    sid = f"live_{name}"
    spec = {
        "id": sid,
        "label": f"live: corner {corner_deg}°, eye h {eye_height} m, dist {eye_dist} m",
        "panels": [
            {"name": "L", "pa": [-8, 0, 0], "pb": [0, 0, 0], "pc": [-8, 6, 0], "res": [1920, 1440]},
            {"name": "R", "pa": [0, 0, 0], "pb": pb, "pc": [0, 6, 0], "res": [1920, 1440]},
        ],
        "eye": eye,
        "ref_camera": {"look_at": [0, 3, 0], "fov_y_deg": 60, "res": [1920, 1080]},
        "viewing_zone": {"center": eye, "half_extent": [3, 0, 3], "grid": [7, 1, 7]},
    }
    for p in spec["panels"]:  # CLAUDE.md §3.2 assert: panel faces the eye
        pa, pb_, pc = p["pa"], p["pb"], p["pc"]
        u = [pb_[i] - pa[i] for i in range(3)]
        v = [pc[i] - pa[i] for i in range(3)]
        nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        if sum(nn[i] * (eye[i] - pa[i]) for i in range(3)) <= 0:
            raise ValueError(f"panel {p['name']} does not face the eye for corner {corner_deg}°")
    (ROOT / "screens").mkdir(exist_ok=True)
    (ROOT / "screens" / f"{sid}.json").write_text(json.dumps(spec, indent=1) + "\n")
    return spec


def runs_list():
    out = []
    d = ROOT / "runs"
    for p in sorted(d.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True) if d.exists() else []:
        if not p.is_dir():
            continue
        vs = sorted(p.glob("v*"))
        last = None
        if vs and (vs[-1] / "report.json").exists():
            last = json.loads((vs[-1] / "report.json").read_text()).get("overall")
        out.append({"run": p.name, "versions": len(vs), "overall": last, "mtime": p.stat().st_mtime})
    return out


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/":
            self.send_response(302); self.send_header("Location", "/web/app/index.html"); self.end_headers(); return
        if self.path == "/api/runs":
            return self._json(runs_list())
        if self.path == "/api/screens":
            out = []
            for f in sorted((ROOT / "screens").glob("*.json")):
                s = json.loads(f.read_text()); s["_file"] = f"screens/{f.name}"; out.append(s)
            return self._json(out)
        if self.path.startswith("/api/run/"):
            rid = self.path.split("/")[-1]
            pr = PROCS.get(rid)
            log = ROOT / "runs" / rid / "loop.log"
            status = "unknown" if pr is None else ("running" if pr.poll() is None else ("done" if pr.returncode in (0, 1) and list((ROOT / "runs" / rid).glob("v*")) else "failed"))
            return self._json({"status": status, "returncode": None if pr is None else pr.poll(),
                               "versions": len(list((ROOT / "runs" / rid).glob("v*"))),
                               "log": log.read_text()[-1500:] if log.exists() else ""})
        return super().do_GET()

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        try:
            if self.path == "/api/screen":
                name = body.get("name") or time.strftime("%H%M%S")
                spec = make_screen(float(body["corner_deg"]), float(body["eye_height"]), float(body["eye_dist"]), name)
                return self._json({"id": spec["id"], "file": f"screens/{spec['id']}.json", "eye": spec["eye"]})
            if self.path == "/api/run":
                stub = bool(body.get("stub"))
                rid = ("STUB_" if stub else "") + time.strftime("%Y%m%d_%H%M%S")
                cmd = [PY, "loop.py", "--assumed", body.get("assumed", "screens/corner_90_demo.json"),
                       "--true", body["true"], "--rounds", str(body.get("rounds", 4)), "--run-id", rid]
                cmd += ["--scene", body["scene"]] if body.get("scene") else ["--brief", body["brief"]]
                if stub:
                    cmd.append("--stub")
                (ROOT / "runs" / rid).mkdir(parents=True, exist_ok=True)
                PROCS[rid] = subprocess.Popen(cmd, cwd=ROOT, stdout=open(ROOT / "runs" / rid / "loop.log", "w"), stderr=subprocess.STDOUT)
                return self._json({"run": rid})
        except (KeyError, ValueError) as e:
            return self._json({"error": str(e)}, 400)
        self._json({"error": "not found"}, 404)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Tangle UI → http://localhost:{port}/web/app/index.html")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
