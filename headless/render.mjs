// node headless/render.mjs --scene S --assumed A.json --true T.json --anchors anchors.json
//      --out runs/<id>/v<N> --times 0,500,1000 [--video]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import * as THREE from 'three';
import { startServer } from './server.mjs';
import { sampleKeyframes, localSize } from '../web/render/scene_builder.js';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[k] = true;
    else { a[k] = next; i++; }
  }
  return a;
}
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const savePNG = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

// ffmpeg: PATH first, then FFMPEG_PATH, then the winget install location.
function findFfmpeg() {
  const cands = ['ffmpeg', process.env.FFMPEG_PATH].filter(Boolean);
  const wg = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wg)) {
    for (const d of fs.readdirSync(wg)) {
      if (!d.startsWith('Gyan.FFmpeg')) continue;
      for (const v of fs.readdirSync(path.join(wg, d))) cands.push(path.join(wg, d, v, 'bin', 'ffmpeg.exe'));
    }
  }
  for (const c of cands) if (spawnSync(c, ['-version']).status === 0) return c;
  throw new Error('ffmpeg not found (set FFMPEG_PATH)');
}

// Point at fraction u (0..1, by arc length) along a polyline of [x,y,z].
function pathAt(path, u) {
  const seg = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1], p[2] - path[i][2]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] === 0 ? 0 : Math.min(1, d / seg[i]);
      return path[i].map((v, c) => v + (path[i + 1][c] - v) * k);
    }
    d -= seg[i];
  }
  return path[path.length - 1];
}

// Pipe JPEG frames (base64 dataURLs, produced lazily by nextFrame(i)) into ffmpeg -> H.264 mp4.
async function encodeVideo(ffmpeg, outFile, fps, count, nextFrame) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))); });
  for (let i = 0; i < count; i++) {
    const url = await nextFrame(i);
    if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
}

const args = parseArgs(process.argv.slice(2));
for (const k of ['scene', 'assumed', 'true', 'out']) {
  if (!args[k]) { console.error(`missing --${k}`); process.exit(2); }
}
// --times 0,500,... (ms) or the preset `key`: 3-4 keyframe times (first, last and up to two in between),
// used to cut render time on the first and final versions of a loop run.
function keyTimes(scene) {
  const end = scene.duration_s * 1000;
  const ts = [...new Set(scene.objects.flatMap((o) => o.keyframes.map((k) => Math.round(k.t * 1000))))]
    .filter((t) => t <= end).sort((a, b) => a - b);
  if (ts.length <= 4) return ts;
  const idx = [0, Math.round((ts.length - 1) / 3), Math.round((2 * (ts.length - 1)) / 3), ts.length - 1];
  return [...new Set(idx)].map((i) => ts[i]);
}
const sceneForTimes = readJSON(args.scene);
const times = String(args.times ?? '0') === 'none'
  ? []
  : String(args.times ?? '0') === 'key'
  ? keyTimes(sceneForTimes)
  : String(args.times ?? '0').split(',').map(Number);
console.log(`times (ms): ${times.join(',')}`);
const out = args.out;

const params = {
  scene: readJSON(args.scene),
  assumed: readJSON(args.assumed),
  true: readJSON(args.true),
  anchors: args.anchors ? readJSON(args.anchors) : null,
};

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(args.scene, path.join(out, 'scene.json'));
fs.copyFileSync(args.assumed, path.join(out, 'assumed_screen.json'));
fs.copyFileSync(args.true, path.join(out, 'true_screen.json'));
if (args.anchors) fs.copyFileSync(args.anchors, path.join(out, 'anchors.json'));

const { server, port } = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => { console.error('[pageerror]', e.message); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${port}/web/render/index.html`);
  await page.waitForFunction(() => window.tangleReady === true, null, { timeout: 30000 });

  await page.evaluate((p) => window.tangleInit(p), params);
  for (const ms of times) {
    const dir = path.join(out, `t_${ms}`);
    const files = await page.evaluate(([p, t]) => window.tangleRenderFrame(p, t), [params, ms]);
    for (const [name, url] of Object.entries(files)) savePNG(path.join(dir, name), url);
    console.log(`t=${ms}ms: wrote ${Object.keys(files).join(', ')}`);
  }

  const fps = params.scene.fps || 30;
  const dur = params.scene.duration_s;
  const ffmpeg = (args.video || args.delivery || args.social) ? findFfmpeg() : null;

  if (args.video) {
    // street.mp4: 2 s fixed eye while the scene plays through (time-lapse over its full duration),
    // then 2 s walk-by (+-2 m, eased) with the scene held at its final state.
    const info = await page.evaluate(([p, o]) => window.tangleVideoOpen(p, 'street', o), [params, { width: 1280, height: 720 }]);
    const seg = 2 * fps;
    const lastKey = Math.max(...params.scene.objects.flatMap((o) => o.keyframes.map((k) => k.t)));
    const heroT = Math.min(dur, lastKey);
    await encodeVideo(ffmpeg, path.join(out, 'street.mp4'), fps, 2 * seg, (i) => {
      if (i < seg) return page.evaluate(([t]) => window.tangleVideoFrame(t, [0, 0, 0]), [(i / (seg - 1)) * dur]);
      const s = (i - seg) / (seg - 1);
      let off;
      const path = params.true.eye_path;
      if (Array.isArray(path) && path.length >= 2) {
        // Screens with an eye_path (e.g. a roadside billboard): the viewer travels along it.
        off = pathAt(path, 0.5 - 0.5 * Math.cos(Math.PI * s)).map((v, k) => v - params.true.eye[k]);
      } else {
        const dx = -2 * Math.cos(Math.PI * s);
        off = info.right.map((v) => v * dx);
      }
      return page.evaluate(([t, o]) => window.tangleVideoFrame(t, o), [heroT, off]);
    });
    console.log(`wrote street.mp4 (${2 * seg} frames, ${info.w}x${info.h}, ${fps} fps)`);
  }

  if (args.hero) {
    // hero.png: a night still from the TRUE eye (the sweet spot), lighting and framing only.
    // Camera stays at the eye; it turns toward the hero object and narrows its field of view so the
    // hero (and its label) fills a good part of the frame. Nothing here touches the checked renders.
    const scene = params.scene, eye = params.true.eye;
    const hero = scene.objects.find((o) => o.type === 'can') || scene.objects[0];
    // Pick the moment: hero near its largest scale AND its label (u = 0.5, local -z) turned toward the eye.
    const labelFacing = (st) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...st.rot.map((d) => (d * Math.PI) / 180), 'XYZ'));
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const toEye = new THREE.Vector3(eye[0] - st.pos[0], eye[1] - st.pos[1], eye[2] - st.pos[2]).normalize();
      return dir.dot(toEye);
    };
    const maxScale = Math.max(...hero.keyframes.map((k) => k.scale));
    let tSec = typeof args.hero === 'string' ? Number(args.hero) : null;
    if (tSec === null) {
      let best = -Infinity;
      for (let t = 0; t <= scene.duration_s + 1e-9; t += 0.05) {
        const s = sampleKeyframes(hero.keyframes, t);
        if (!s.exists) continue;
        const f = labelFacing(s);
        const score = f > 0.85 && s.scale >= 0.85 * maxScale ? 1 + s.scale + f : f + s.scale * 0.1;
        if (score > best + 1e-9) { best = score; tSec = t; }
      }
    }
    const st = sampleKeyframes(hero.keyframes, tSec);
    const [, hh] = localSize(hero);
    const heightM = hh * st.scale;
    const center = [st.pos[0], st.pos[1], st.pos[2]];
    const dist = Math.hypot(center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]);
    const angH = 2 * Math.atan(heightM / 2 / dist) * 180 / Math.PI;
    const fov = Math.min(50, Math.max(26, angH / 0.42));
    // Two street lamps in frame at the left/right thirds, beside the billboard.
    const hx = center[0] - eye[0], hz = center[2] - eye[2], hl = Math.hypot(hx, hz);
    const D = [hx / hl, hz / hl], Rv = [-D[1], D[0]];
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9));
    const dl = Math.min(hl * 0.95, hl - 1), lat = dl * Math.tan(hfov / 2) * 0.8;
    const lamps = [-1, 1].map((sgn) => [eye[0] + D[0] * dl + Rv[0] * lat * sgn, eye[2] + D[1] * dl + Rv[1] * lat * sgn]);
    await page.evaluate(([p, o]) => window.tangleVideoOpen(p, 'street', o), [params, {
      width: 1920, height: 1080, night: true, glow: true, panelScale: 1, lookAt: center, fovY: fov, quality: 1, lamps,
    }]);
    const url = await page.evaluate(([t]) => window.tangleVideoStill(t, [0, 0, 0]), [tSec]);
    savePNG(path.join(out, 'hero.png'), url);
    console.log(`wrote hero.png (t=${tSec.toFixed(2)}s, label facing ${labelFacing(st).toFixed(2)}, hero=${hero.id}, hero height ${heightM.toFixed(2)} m at ${dist.toFixed(1)} m, fov ${fov.toFixed(1)} deg)`);
  }

  if (args.social) {
    // social.mp4: vertical 1080x1920, 15 s at 30 fps. Night street, camera starts at the TRUE eye
    // and eases 2 m toward the corner (look-at stays on the corner, so the billboard stays centred).
    // Scene time: real speed, looped if the scene is shorter than 15 s, compressed if longer.
    const W = 1080, H = 1920, SOCIAL_FPS = 30, CLIP_S = 15, PUSH_M = 2;
    await page.evaluate(([p, o]) => window.tangleVideoOpen(p, 'street', o), [params, {
      width: W, height: H, night: true, fovY: 80, quality: 0.92,
      label: { text: 'CGI', size: 24, margin: 24 },
    }]);
    const eye = params.true.eye, la = params.true.ref_camera.look_at;
    const hx = la[0] - eye[0], hz = la[2] - eye[2], hl = Math.hypot(hx, hz);
    const dir = [hx / hl, 0, hz / hl];
    const n = CLIP_S * SOCIAL_FPS;
    const speed = dur > CLIP_S ? dur / CLIP_S : 1;
    await encodeVideo(ffmpeg, path.join(out, 'social.mp4'), SOCIAL_FPS, n, (i) => {
      const s = i / (n - 1);
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * s); // ease-in-out
      const off = dir.map((v) => v * PUSH_M * ease);
      const t = ((i / SOCIAL_FPS) * speed) % dur;
      return page.evaluate(([tt, o]) => window.tangleVideoFrame(tt, o), [t, off]);
    });
    console.log(`wrote social.mp4 (${n} frames, ${W}x${H}, ${SOCIAL_FPS} fps)`);
  }

  if (args.delivery) {
    // delivery.mp4: L and R panel frames side by side at native res, full duration, scene fps.
    const info = await page.evaluate(([p]) => window.tangleVideoOpen(p, 'delivery', {}), [params]);
    const n = Math.round(dur * fps);
    await encodeVideo(ffmpeg, path.join(out, 'delivery.mp4'), fps, n, (i) =>
      page.evaluate(([t]) => window.tangleVideoFrame(t), [i / fps]));
    console.log(`wrote delivery.mp4 (${n} frames, ${info.w}x${info.h}, ${fps} fps)`);
  }
} finally {
  await browser.close();
  server.close();
}
