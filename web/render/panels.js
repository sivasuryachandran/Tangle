// Panel render (ASSUMED spec): each panel is rendered through its own off-axis frustum
// from the assumed eye, at the panel's native resolution. These are the images the
// street sim later maps onto the TRUE panel quads.
import * as THREE from 'three';
import { buildScene } from './scene_builder.js';
import { applyToCamera } from './offaxis.js';

export function makeRenderer(width, height, { antialias = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const r = new THREE.WebGLRenderer({ canvas, antialias, preserveDrawingBuffer: true, alpha: false });
  r.setPixelRatio(1);
  r.setSize(width, height, false);
  r.toneMapping = THREE.NoToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 1);
  return r;
}

// Renders one panel of `spec` from `spec.eye` into `renderer` (must match panel res).
export function renderPanel(renderer, sceneApi, panel, eye) {
  const cam = new THREE.PerspectiveCamera();
  applyToCamera(cam, panel, eye);
  renderer.render(sceneApi.root, cam);
}

// Returns { [panel.name]: dataURL } for time tSec.
export function renderPanels(sceneJson, assumedSpec, tSec) {
  const api = buildScene(THREE, sceneJson);
  api.update(tSec);
  const out = {};
  for (const panel of assumedSpec.panels) {
    const [w, h] = panel.res;
    const renderer = makeRenderer(w, h, { antialias: true });
    renderPanel(renderer, api, panel, assumedSpec.eye);
    out[panel.name] = renderer.domElement.toDataURL('image/png');
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return out;
}
