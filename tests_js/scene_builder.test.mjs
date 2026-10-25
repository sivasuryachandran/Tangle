import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildScene, sampleKeyframes } from '../web/render/scene_builder.js';

const scene = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/scene_test.json', import.meta.url)));

test('keyframes interpolate linearly and hold', () => {
  const kf = scene.objects[0].keyframes;
  assert.deepEqual(sampleKeyframes(kf, 0).pos, [-3, 2, -3]);
  const mid = sampleKeyframes(kf, 3);
  assert.deepEqual(mid.pos, [-0.75, 2.5, -0.75]);
  assert.deepEqual(mid.rot, [0, 45, 0]);
  assert.ok(Math.abs(mid.scale - 1.2) < 1e-12);
  assert.deepEqual(sampleKeyframes(kf, 99).pos, [1.5, 3, 1.5]);
  assert.deepEqual(sampleKeyframes(scene.objects[1].keyframes, 0).pos, [-4, 4.5, 0.05]);
});

test('buildScene places objects at time t', () => {
  const s = buildScene(THREE, scene);
  s.update(3);
  const p = s.byId.can.position;
  assert.ok(Math.abs(p.x + 0.75) < 1e-9 && Math.abs(p.y - 2.5) < 1e-9);
  assert.ok(Math.abs(s.byId.can.scale.x - 1.2) < 1e-9);
  const w = s.byId.title.geometry.parameters.width;
  assert.ok(Math.abs(w - 0.6 * 0.8 * 16) < 1e-9);
});

test('mask mode is reversible', () => {
  const s = buildScene(THREE, scene);
  s.setMode('mask');
  assert.equal(s.room.visible, false);
  s.setMode('normal');
  assert.equal(s.room.visible, true);
});
