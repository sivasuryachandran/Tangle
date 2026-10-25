// Copies three.js and the few addons the hero page uses into web/hero/vendor/three, so the hero
// works from a static folder with no node_modules and no CDN. Follows relative imports recursively.
//   node headless/vendor_hero.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'node_modules', 'three');
const DST = path.join(ROOT, 'web', 'hero', 'vendor', 'three');

const entries = [
  'build/three.module.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/lights/RectAreaLightUniformsLib.js',
];

const seen = new Set();
function copy(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const from = path.join(SRC, rel);
  const to = path.join(DST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const text = fs.readFileSync(from, 'utf8');
  for (const m of text.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
    copy(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
}
entries.forEach(copy);
fs.copyFileSync(path.join(SRC, 'LICENSE'), path.join(DST, 'LICENSE'));
const version = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8')).version;
console.log(`copied ${seen.size} files, three ${version}, to web/hero/vendor/three`);
