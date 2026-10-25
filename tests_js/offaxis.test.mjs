import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { offAxisMatrix, projectNDC } from '../web/render/offaxis.js';

const spec = JSON.parse(fs.readFileSync(new URL('../screens/corner_90_demo.json', import.meta.url)));

test('panel corners map to NDC corners', () => {
  for (const p of spec.panels) {
    const m = offAxisMatrix(p, spec.eye);
    const pd = p.pb.map((v, i) => v + p.pc[i] - p.pa[i]);
    const exp = [[p.pa, -1, -1], [p.pb, 1, -1], [p.pc, -1, 1], [pd, 1, 1]];
    for (const [pt, x, y] of exp) {
      const n = projectNDC(m, pt);
      assert.ok(Math.abs(n[0] - x) < 1e-9 && Math.abs(n[1] - y) < 1e-9, `${p.name} ${pt}`);
    }
  }
});

test('panel facing away from the eye throws', () => {
  assert.throws(() => offAxisMatrix(spec.panels[0], [10, 1.7, -10]));
});
