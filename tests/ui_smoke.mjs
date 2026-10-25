// UI smoke test (P3): every page loads without JS errors and the hero iframe renders where it is plugged in.
// usage: node tests/ui_smoke.mjs [baseUrl]   (default http://localhost:8000; needs `python3 web/app/server.py 8000` running)
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8000';
const pages = [['index.html', true], ['new-test.html', true], ['street-view-test.html?run=g5_flare', true], ['repair.html?run=g5_flare', true],
  ['certificate.html?run=g4_rehearsal', true], ['screens.html', false], ['downloads.html?run=g5_flare', false]];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fail = 0;
for (const [p, hero] of pages) {
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } }), errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(`${base}/web/app/${p}`); await pg.waitForTimeout(hero ? 9000 : 3000);
  let ok = errs.length === 0, note = errs.slice(0, 2).join(' | ');
  if (hero) {
    const fr = pg.frames().find((f) => f.url().includes('/web/hero/index.html'));
    const ready = fr ? await fr.evaluate(() => !!window.heroReady).catch(() => false) : false;
    if (!ready) { ok = false; note += ' hero iframe not ready'; }
  }
  if (p.startsWith('screens')) { const n = await pg.locator('.screen-card').count(); if (n < 5) { ok = false; note += ` only ${n} screen cards`; } }
  console.log(ok ? 'PASS' : 'FAIL', p, note); if (!ok) fail++; await pg.close();
}
await b.close(); process.exit(fail ? 1 : 0);
