import { chromium } from 'playwright'; import { fileURLToPath } from 'url'; import path from 'path';
const D = path.dirname(fileURLToPath(import.meta.url)); const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await pg.goto('file://' + D + '/architecture.html'); await pg.waitForTimeout(1200); await pg.screenshot({ path: D + '/architecture.png' }); await b.close();
