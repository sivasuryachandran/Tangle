// Screenshots of the hero page for the critic loop and for the poster.
//   node headless/hero_shots.mjs --out <dir> [--t 7.2] [--views overview,closeup,low,wire] [--size 1600x900] [--run runs/<id>/v<N>] [--poster]
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
const out = args.out || 'runs/dev/hero_shots';
const tArg = args.t ?? 'auto';
const views = String(args.views || 'overview,closeup,low,wire').split(',');
const [W, H] = String(args.size || '1600x900').split('x').map(Number);
fs.mkdirSync(out, { recursive: true });

const { server, port } = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  const url = `http://127.0.0.1:${port}/web/hero/index.html?shot=1${args.run ? '&run=' + args.run : ''}${args.ad ? '&ad=' + args.ad : ''}`;
  await page.goto(url);
  await page.waitForFunction(() => window.heroReady === true && window.heroAPI, null, { timeout: 120000 });
  await page.addStyleTag({ content: '.bar,#dev,#poster,#caption,#bottom,#hint{display:none!important}' });
  const tSec = tArg === 'auto' ? await page.evaluate(() => window.heroAPI.bestTime()) : Number(tArg);
  console.log('scene time', tSec);
  for (const v of views) {
    const wire = v === 'wire';
    await page.evaluate(([view, t, w, vp]) => window.heroAPI.shot(view, t, w, vp), [wire ? 'overview' : v, tSec, wire, Number(args.vp || 0)]);
    const file = path.join(out, `${v}.png`);
    await page.screenshot({ path: file, timeout: 120000 });
    console.log('wrote', file);
  }
} finally {
  await browser.close();
  server.close();
}
