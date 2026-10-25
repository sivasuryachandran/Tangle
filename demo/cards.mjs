import { chromium } from 'playwright';
import { fileURLToPath } from 'url'; import path from 'path';
const D = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const n of ['end']) { await pg.goto('file://' + D + `/${n}.html`); await pg.waitForTimeout(1200); await pg.screenshot({ path: `${D}/out/cards/${n}.png` }); }
await b.close();
