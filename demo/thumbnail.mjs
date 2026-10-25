import { chromium } from 'playwright'; import { fileURLToPath } from 'url'; import path from 'path';
const D = path.dirname(fileURLToPath(import.meta.url)); const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.goto('file://' + D + '/thumbnail.html'); await pg.waitForTimeout(1200); await pg.screenshot({ path: D + '/youtube_thumbnail.png' }); await b.close();
