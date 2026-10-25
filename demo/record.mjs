// Records the five app shots (1920x1080) against the local app (localhost:8000) and writes demo/out/clips/shotN.webm + shotN.json (action start offset).
// Each shot runs for its narration length + tail; app-load time before the action is trimmed later using the recorded offset.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url'; import path from 'path';
const D = path.dirname(fileURLToPath(import.meta.url)), BASE = process.env.BASE || 'http://localhost:8000';
const dur = JSON.parse(readFileSync(`${D}/audio/durations.json`)), nar = JSON.parse(readFileSync(`${D}/narration.json`)), vals = JSON.parse(readFileSync(`${D}/values.json`));
const TAIL = 0.25, RUN = vals.run_id;
const txt = (id) => nar.segments.find((s) => s.id === id).text.replace(/\{(\w+)\}/g, (_, k) => vals[k]);
const shots = {
  1: { segs: ['s1'], act: async (p) => { await p.waitForTimeout(100); }, url: `/web/app/index.html`, ready: async (p) => { await p.waitForFunction(() => window.frames[0] && window.frames[0].heroReady === true, null, { timeout: 60000 }).catch(() => {}); } },
  2: { segs: ['s2'], url: `/web/app/new-test.html`, ready: async (p) => { await p.waitForSelector('#brief'); await p.waitForTimeout(2500); },
    act: async (p, T) => { await p.click('#brief'); await p.keyboard.press('Meta+A'); await p.keyboard.press('Backspace'); await p.keyboard.type("A FLARE can bursts out of the corner, then 'Light up the corner.'", { delay: 28 }); await p.waitForTimeout(500); await p.click('[data-type="corner"]'); } },
  3: { segs: ['s3a', 's3b'], url: `/web/app/street-view-test.html?run=${RUN}`, ready: async (p) => { await p.waitForSelector('#ver'); await p.selectOption('#ver', '1'); await p.waitForTimeout(2500); },
    act: async (p, T) => { await p.waitForTimeout(T.s3a * 1000 - 500);
      await p.evaluate(() => { const st = document.createElement('style'); st.textContent = '.hl-fail{outline:3px solid #E5484D!important;box-shadow:0 0 28px rgba(229,72,77,.55)!important;border-radius:14px}'; document.head.appendChild(st);
        document.querySelectorAll('#app div').forEach((d) => { if (/C[2-5]/.test(d.textContent.slice(0, 6)) && /FAIL/.test(d.textContent) && d.textContent.length < 400 && d.className.includes('rounded')) d.classList.add('hl-fail'); }); }); } },
  4: { segs: ['s4a', 's4b_B'], url: `/web/app/repair.html?run=${RUN}`, ready: async (p) => { await p.waitForSelector('[data-n]'); await p.waitForTimeout(2500); },
    act: async (p, T) => { const total = (T.s4a + T.s4b_B) * 1000, steps = [[0, 1], [0.16, 2], [0.32, 3], [0.50, 4], [0.66, vals.best_v]];
      let t0 = Date.now(); for (const [f, n] of steps) { const wait = f * total - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait); await p.click(`[data-n="${n}"]`); if (n === 2) await p.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })); } } },
  5: { segs: ['s5'], url: `/web/hero/index.html?zoom=0`, ready: async (p) => { await p.waitForFunction(() => window.heroReady === true, null, { timeout: 60000 }).catch(() => {}); },
    act: async (p, T) => { await p.click('#btnEye'); await p.waitForTimeout(2300); await p.goto(`${BASE}/web/app/certificate.html?run=${RUN}`); await p.waitForTimeout(1500); } },
};
const which = (process.argv[2] ? [process.argv[2]] : Object.keys(shots));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'] });
for (const k of which) {
  const S = shots[k]; const T = dur; const secs = S.segs.reduce((a, id) => a + T[id], 0) + (S.segs.length - 1) * 0.1 + TAIL;
  const dir = `${D}/out/clips/s${k}`; mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir, size: { width: 1920, height: 1080 } } }); const t0 = Date.now();
  const p = await ctx.newPage(); await p.goto(BASE + S.url); await S.ready(p);
  // captions: each narration segment on screen while it is spoken
  await p.addStyleTag({ content: '#__cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:1560px;padding:14px 26px;background:rgba(0,0,0,.78);color:#F5F5F7;font:500 34px/1.3 Geist,system-ui,sans-serif;border-radius:14px;z-index:2147483647;text-align:center}' });
  const start = (Date.now() - t0) / 1000;
  const cap = (t) => p.evaluate((t) => { let c = document.getElementById('__cap'); if (!c) { c = document.createElement('div'); c.id = '__cap'; document.body.appendChild(c); } c.textContent = t; }, t);
  const acting = S.act ? S.act(p, T) : Promise.resolve();
  let at = 0; for (const id of S.segs) { await cap(txt(id)); await p.waitForTimeout(T[id] * 1000 + 100); }
  await acting.catch((e) => console.log('act error', k, e.message)); await p.waitForTimeout(TAIL * 1000);
  const vid = p.video(); await ctx.close(); const f = await vid.path(); renameSync(f, `${D}/out/clips/shot${k}.webm`);
  writeFileSync(`${D}/out/clips/shot${k}.json`, JSON.stringify({ start, secs })); console.log('shot', k, 'start', start.toFixed(1), 'secs', secs.toFixed(2));
}
await b.close();
