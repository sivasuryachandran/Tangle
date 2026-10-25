import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildScene, sampleKeyframes, setLibrary, LIB, IMAGE_CACHE } from '../web/render/scene_builder.js';

const scene = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/scene_test.json', import.meta.url)));

test('keyframes interpolate linearly and hold', () => {
  const kf = scene.objects[0].keyframes;
  assert.deepEqual(sampleKeyframes(kf, 0).pos, [-3, 2, -3]);
  const mid = sampleKeyframes(kf, 3);
  assert.deepEqual(mid.pos, [-0.75, 2.5, -0.75]);
  assert.deepEqual(mid.rot, [0, 45, 0]);
  assert.ok(Math.abs(mid.scale - 1.2) < 1e-12);
  assert.deepEqual(sampleKeyframes(kf, 99).pos, [1.5, 3, 1.5]);
  const title = scene.objects[1].keyframes;
  assert.equal(sampleKeyframes(title, 0).exists, false); // before first keyframe
  assert.equal(sampleKeyframes(title, 7).exists, true);
  assert.deepEqual(sampleKeyframes(title, 9).pos, title[title.length - 1].pos); // held
  const vanish = [{ t: 0, pos: [0, 1, 0], rot: [0, 0, 0], scale: 1 }, { t: 2, pos: [0, 1, 0], rot: [0, 0, 0], scale: 0 }];
  assert.equal(sampleKeyframes(vanish, 1).exists, true);
  assert.equal(sampleKeyframes(vanish, 2).exists, false);
});

test('buildScene places objects at time t', () => {
  const s = buildScene(THREE, scene);
  s.update(3);
  const p = s.byId.can.position;
  assert.ok(Math.abs(p.x + 0.75) < 1e-9 && Math.abs(p.y - 2.5) < 1e-9);
  assert.ok(Math.abs(s.byId.can.scale.x - 1.2) < 1e-9);
  assert.equal(s.byId.title.visible, false);
  assert.equal(s.byId.can.visible, true);
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

test('sizes follow schemas/object_library.json', () => {
  const lib = JSON.parse(fs.readFileSync(new URL('../schemas/object_library.json', import.meta.url)));
  setLibrary(lib);
  assert.equal(LIB.can.radius, lib.can.radius_m);
  assert.equal(LIB.can.height, lib.can.height_m);
  assert.equal(LIB.sphere.radius, lib.sphere.radius_m);
  assert.equal(LIB.particles.count, lib.particles.count);
  const s = buildScene(THREE, { ...scene, objects: [{ id: 'b', type: 'box', keyframes: [{ t: 0, pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 }] }] });
  assert.deepEqual([s.byId.b.geometry.parameters.width, s.byId.b.geometry.parameters.height, s.byId.b.geometry.parameters.depth], lib.box.size_m);
});

test('can label_image wins when loaded, procedural label_text is the fallback', () => {
  const base = { ...scene, objects: [{ id: 'c', type: 'can', label_text: 'FIZZ', label_image: 'x.png',
    keyframes: [{ t: 0, pos: [0, 1, 0], rot: [0, 0, 0], scale: 1 }] }] };
  const labels = (api) => { const out = []; api.byId.c.traverse((o) => { if (o.userData.label) out.push(o); }); return out; };
  // not loaded: no document in Node, so the procedural band is skipped too, but nothing throws
  assert.doesNotThrow(() => buildScene(THREE, base));
  IMAGE_CACHE.set('x.png', { width: 8, height: 4 });
  const withImg = labels(buildScene(THREE, base));
  assert.equal(withImg.length, 1);
  assert.equal(withImg[0].geometry.parameters.height, LIB.can.height); // wraps the whole side
  assert.ok(withImg[0].material.map);
  IMAGE_CACHE.delete('x.png');
});

test('room is built for any panel set; shared edges get no side wall', () => {
  const panels = [
    { name: 'left', pa: [-4, 0, 0], pb: [-4, 0, -4], pc: [-4, 6, 0] },
    { name: 'front', pa: [-4, 0, -4], pb: [4, 0, -4], pc: [-4, 6, -4] },
    { name: 'right', pa: [4, 0, -4], pb: [4, 0, 0], pc: [4, 6, -4] },
  ];
  const s = buildScene(THREE, scene, panels);
  // 3 panels x (back, floor, ceiling) = 9, plus side walls only on the 2 unshared outer edges = 11
  assert.equal(s.room.children.length, 11);
  assert.equal(buildScene(THREE, scene).room.children.length, 3 * 2 + 2); // default corner: 2 panels, 6 + 2 outer sides
});

test('photo card: flat XY quad, normal +z, centred, height from aspect or height_m', () => {
  const kf = [{ t: 0, pos: [-2, 3, -0.2], rot: [0, 0, 0], scale: 1 }];
  IMAGE_CACHE.set('inputs/card.png', { width: 400, height: 200 });
  const s = buildScene(THREE, { ...scene, objects: [
    { id: 'a', type: 'photo', image: 'inputs/card.png', width_m: 1.5, keyframes: kf },
    { id: 'b', type: 'photo', image: 'inputs/card.png', width_m: 1.5, height_m: 0.9, keyframes: kf },
  ] });
  s.update(0);
  const a = s.byId.a, b = s.byId.b;
  assert.equal(a.geometry.parameters.width, 1.5);
  assert.equal(a.geometry.parameters.height, 0.75);   // 1.5 / aspect 2
  assert.equal(b.geometry.parameters.height, 0.9);    // height_m wins
  assert.deepEqual(a.position.toArray(), [-2, 3, -0.2]);
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(a.quaternion);
  assert.ok(Math.abs(n.z - 1) < 1e-9);                 // normal +z at rotation 0
  const bb = new THREE.Box3().setFromObject(a);
  assert.ok(Math.abs(bb.getCenter(new THREE.Vector3()).x + 2) < 1e-9 && Math.abs(bb.max.z - bb.min.z) < 1e-9); // centred, flat
  IMAGE_CACHE.delete('inputs/card.png');
});
