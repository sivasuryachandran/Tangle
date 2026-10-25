// node headless/render.mjs --scene S --assumed A.json --true T.json --anchors anchors.json
//      --out runs/<id>/v<N> --times 0,500,1000 [--video]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

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
const times = String(args.times ?? '0').split(',').map(Number);
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
      const dx = -2 * Math.cos(Math.PI * s);
      const off = info.right.map((v) => v * dx);
      return page.evaluate(([t, o]) => window.tangleVideoFrame(t, o), [heroT, off]);
    });
    console.log(`wrote street.mp4 (${2 * seg} frames, ${info.w}x${info.h}, ${fps} fps)`);
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
