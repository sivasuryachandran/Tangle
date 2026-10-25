// Export the hero page's PBR screen contents (what the screens would show) as PNGs.
//   node headless/hero_panels.mjs --out <dir> [--t auto|<sec>] [--frames N --fps 30]   (frames: t = i/fps, files f_0000/L.png ...)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith('--')) continue;
  const k = process.argv[i].slice(2), n = process.argv[i + 1];
  if (n === undefined || n.startsWith('--')) args[k] = true; else { args[k] = n; i++; }
}
const out = args.out || 'runs/hero/panels';
fs.mkdirSync(out, { recursive: true });
const { server, port } = await startServer();
const gpu = args.swiftshader ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: [...gpu, '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/web/hero/index.html?shot=1${args.run ? '&run=' + args.run : ''}`);
  await page.waitForFunction(() => window.heroReady === true && window.heroAPI, null, { timeout: 120000 });
  const renderer = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; });
  console.log('GL:', renderer);
  const names = await page.evaluate(() => window.heroAPI.panelNames);
  const save = async (dir, t) => {
    fs.mkdirSync(dir, { recursive: true });
    await page.evaluate((t) => window.heroAPI.contentOnly(t), t);
    for (const n of names) {
      const url = await page.evaluate((n) => window.heroAPI.panelPNG(n), n);
      fs.writeFileSync(path.join(dir, `${n}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  };
  if (args.frames) {
    const fps = Number(args.fps || 30), n = Number(args.frames);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) await save(path.join(out, `f_${String(i).padStart(4, '0')}`), i / fps);
    console.log(`wrote ${n} frames in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } else {
    const t = args.t && args.t !== 'auto' ? Number(args.t) : await page.evaluate(() => window.heroAPI.bestTime());
    await save(out, t);
    console.log('wrote panels at t =', t.toFixed(2), 'to', out);
  }
} finally {
  await browser.close();
  server.close();
}
