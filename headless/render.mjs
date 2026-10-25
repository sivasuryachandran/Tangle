// node headless/render.mjs --scene S --assumed A.json --true T.json --anchors anchors.json
//      --out runs/<id>/v<N> --times 0,500,1000 [--video]
import fs from 'node:fs';
import path from 'node:path';
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
    const panels = await page.evaluate(([p, t]) => window.tangleRenderPanels(p, t), [params, ms]);
    for (const [name, url] of Object.entries(panels)) savePNG(path.join(dir, `${name}.png`), url);
    console.log(`t=${ms}ms: wrote ${Object.keys(panels).map((n) => n + '.png').join(', ')}`);
  }
} finally {
  await browser.close();
  server.close();
}
