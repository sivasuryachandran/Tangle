// Reference render: the scene viewed directly from the TRUE eye with the TRUE ref_camera
// (no screens involved). This is what the street sim should reproduce when the
// assumed and true specs agree.
import * as THREE from 'three';
import { buildScene } from './scene_builder.js';
import { makeRenderer } from './panels.js';
import { makeRefCamera } from './streetsim.js';

export function renderReference(sceneJson, trueSpec, tSec) {
  const api = buildScene(THREE, sceneJson);
  api.update(tSec);
  const [w, h] = trueSpec.ref_camera.res;
  const renderer = makeRenderer(w, h, { antialias: true });
  renderer.setClearColor(new THREE.Color(sceneJson.backdrop.color).multiplyScalar(0.7), 1);
  renderer.render(api.root, makeRefCamera(trueSpec));
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

// Mask pass: hero objects flat white on black, direct from the TRUE eye, no antialiasing.
export function renderMask(sceneJson, trueSpec, tSec) {
  const api = buildScene(THREE, sceneJson);
  api.update(tSec);
  api.setMode('mask');
  const [w, h] = trueSpec.ref_camera.res;
  const renderer = makeRenderer(w, h, { antialias: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  renderer.render(api.root, makeRefCamera(trueSpec));
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
